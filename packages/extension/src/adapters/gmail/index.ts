// [P1] Gmail content script entry. Observe → extract → score → render, on-device.
//
// State pass-through (trap B): the core engine is pure and cannot read
// chrome.storage.local, so we fetch LocalState FIRST and pass the OTA thresholds
// and the user whitelist into analyzeEmail. Without this the engine can't see a
// "Mark Safe" sender or the tuned thresholds.

import { analyzeEmail, type Verdict } from '@credmail/core';
import {
  getState,
  getDomSelectors,
  addToWhitelist,
  addToSafeContacts,
  addToBlocklist,
} from '../../storage/local-state';
import { startObserver } from './observer';
import { extract } from './parser';
import { injectBanner } from '../../ui/banner';
import { injectPill } from '../../ui/pill';
import { hijackBadLinks, restoreLinks } from './interceptor';
import freeProviders from '../../../../../data/free-email-providers.json';

// Freemail domains can't be trusted wholesale — whitelisting gmail.com would clear the
// gate for every Gmail sender. When Mark Safe lands on one of these we store the full
// address as a safe contact instead of the domain.
const FREE_PROVIDERS = new Set((freeProviders as string[]).map((d) => d.toLowerCase()));

// Scored verdicts by message id. The engine never re-runs for a message we've
// already judged — reopening an email is a cache hit, not a rescan. We keep the
// sender alongside the verdict so the cache-hit path can re-render the banner
// WITHOUT re-extracting; everything else (emailData, container) is re-derived live.
const verdictCache = new Map<string, { verdict: Verdict; senderEmail: string }>();

/** Bump a this-session counter in chrome.storage.local (read-modify-write). */
async function incrementStat(key: 'scanned' | 'detected' | 'markedSafe'): Promise<void> {
  const stored = await chrome.storage.local.get({
    session_stats: { scanned: 0, detected: 0, markedSafe: 0 },
  });
  const session_stats = stored.session_stats as { scanned: number; detected: number; markedSafe: number };
  session_stats[key] += 1;
  await chrome.storage.local.set({ session_stats });
}

/** The reading-pane subject element (OTA subject selectors), for the pill. */
async function findSubjectElement(): Promise<HTMLElement | null> {
  const selectors = await getDomSelectors();
  for (const sel of selectors.subject ?? []) {
    try {
      const el = document.querySelector(sel);
      if (el) return el as HTMLElement;
    } catch {
      /* invalid OTA selector — ignore */
    }
  }
  return null;
}

/** Paint (or, when Safe/silent, clear) the banner and pill for a verdict. */
async function render(
  verdict: Verdict,
  container: Element,
  senderEmail: string,
  onMarkSafe: (senderEmail: string) => void,
  onReport: (senderEmail: string) => void,
): Promise<void> {
  // Core's Verdict is structurally the UI's VerdictView; container is an Element
  // here but the banner only uses ParentNode ops.
  injectBanner(verdict, container as HTMLElement, senderEmail, onMarkSafe, onReport);
  const subjectEl = await findSubjectElement();
  if (subjectEl) injectPill(verdict, subjectEl);

  // Link Shield: on a warning verdict, rewrite the flagged links to route through
  // the local warning page; on a Safe/silent verdict, undo any prior hijack. Runs
  // on every render path (cache miss, cache hit, and the Mark-Safe re-render).
  const el = container as HTMLElement;
  if (verdict.silent) {
    restoreLinks(el);
  } else {
    const badLinks = verdict.reasons.flatMap((r) => r.affectedLinks ?? []);
    const reasons = verdict.reasons.map((r) => r.description);
    hijackBadLinks(el, badLinks, reasons);
  }
}

startObserver(async (messageId, container) => {
  // Mark Safe: trust the sender, then re-extract from the LIVE DOM and re-score (never
  // a cached emailData — we don't store one) so the new verdict is accurate. Freemail
  // senders trust the full address (safe contact); everyone else trusts the domain.
  // A failed extraction is logged and skipped, never thrown.
  const onMarkSafe = async (senderEmail: string): Promise<void> => {
    // Restore hijacked links up front, so they're returned to normal even if the
    // re-extract below fails (the silent re-render would otherwise do it for us).
    restoreLinks(container as HTMLElement);
    const domain = senderEmail.split('@')[1]?.toLowerCase() ?? '';
    if (domain) {
      if (FREE_PROVIDERS.has(domain)) await addToSafeContacts(senderEmail);
      else await addToWhitelist(domain);
    }
    await incrementStat('markedSafe');
    const fresh = await extract(container, messageId);
    if (!fresh) {
      console.warn(
        `[CredMail] Mark Safe re-score skipped: extraction returned null for ${messageId}`,
      );
      return;
    }
    const state = await getState();
    const whitelist = [...state.local_whitelist, ...state.safe_contacts];
    const verdict = analyzeEmail(fresh, state.scoring_config, whitelist);
    verdictCache.set(messageId, { verdict, senderEmail: fresh.senderEmail });
    await render(verdict, container, fresh.senderEmail, onMarkSafe, onReport);
  };

  // Report: add the sender to the blocklist so the inbox row scanner flags it as
  // "reported", and count it as a detection.
  const onReport = async (senderEmail: string): Promise<void> => {
    await addToBlocklist(senderEmail);
    await incrementStat('detected');
    console.log('[CredMail] Reported:', senderEmail);
  };

  const cached = verdictCache.get(messageId);
  if (cached) {
    console.log(
      `[CredMail] cache hit for ${messageId}: ${cached.verdict.riskLevel} (${cached.verdict.score})`,
    );
    await render(cached.verdict, container, cached.senderEmail, onMarkSafe, onReport);
    return;
  }

  const state = await getState(); // CRITICAL: state before scoring (trap B)
  if (!state.is_active) return;

  const emailData = await extract(container, messageId);
  if (!emailData) return; // low confidence — parser already fired telemetry

  const whitelist = [...state.local_whitelist, ...state.safe_contacts];
  const verdict = analyzeEmail(emailData, state.scoring_config, whitelist);
  verdictCache.set(messageId, { verdict, senderEmail: emailData.senderEmail });
  console.log(
    `[CredMail] Verdict for ${messageId}: ${verdict.riskLevel} (${verdict.score})`,
  );
  // Stats: cache MISS only, so reopening an email never double-counts.
  await incrementStat('scanned');
  if (verdict.riskLevel === 'Suspicious' || verdict.riskLevel === 'High Risk') {
    await incrementStat('detected');
  }
  await render(verdict, container, emailData.senderEmail, onMarkSafe, onReport);
});

console.log('[CredMail] gmail content script loaded');

// --- Inbox row scanner (ISOLATED, disposable) -------------------------------
// A SEPARATE system from the open-email pipeline above — its own observer, no shared
// state, no core. Delete this block + row-scanner.ts to remove it entirely; nothing
// above depends on it. (Import sits here, not at the top, to keep it one deletable unit.)
import { scanInboxRows } from './row-scanner';

const ROW_SCAN_DEBOUNCE_MS = 500;
const MESSAGE_ID_MIN_LEN = 20;

/** True for list views (#inbox, #label/X, #search/q); false for an open message,
 * whose hash ends in a long thread-id segment (#inbox/FMfcgz...). */
function isInboxView(): boolean {
  const segments = location.hash.replace(/^#/, '').split('/').filter(Boolean);
  if (segments.length === 0) return true;
  return segments[segments.length - 1].length <= MESSAGE_ID_MIN_LEN;
}

/** Scan now, then once more 1.5s later — the second pass catches rows whose email
 * attributes hadn't been populated yet on the first pass (Gmail fills them in after
 * the row renders, and no childList mutation fires for that attribute change). */
async function scanWithRetry(): Promise<void> {
  // Inbox-row scanning is independently toggleable (default on) — when off, the
  // main email-open protection still runs; only row pills stop.
  const { scan_inbox_rows = true } = await chrome.storage.local.get({ scan_inbox_rows: true });
  if (!scan_inbox_rows) return;
  await scanInboxRows();
  setTimeout(async () => {
    try {
      await scanInboxRows();
    } catch {
      /* best effort */
    }
  }, 1500);
}

let rowScanTimer: number | undefined;
new MutationObserver(() => {
  if (rowScanTimer !== undefined) clearTimeout(rowScanTimer);
  rowScanTimer = window.setTimeout(async () => {
    try {
      const { is_active } = await chrome.storage.local.get({ is_active: true });
      if (is_active && isInboxView()) await scanWithRetry();
    } catch {
      /* row scan is best-effort — never crash the observer */
    }
  }, ROW_SCAN_DEBOUNCE_MS);
}).observe(document.body, { childList: true, subtree: true });

// Direct navigation trigger (fixes the trigger gap): Gmail's SPA hash swaps don't
// reliably emit the childList mutations our observer watches, so scan on hashchange
// too — after a short render delay.
window.addEventListener('hashchange', () => {
  setTimeout(async () => {
    if (!isInboxView()) return;
    try {
      const { is_active } = await chrome.storage.local.get({ is_active: true });
      if (is_active) await scanWithRetry();
    } catch {
      /* best effort */
    }
  }, 500);
});

// First page render: the observer may have fired before any rows existed.
setTimeout(async () => {
  if (!isInboxView()) return;
  try {
    const { is_active } = await chrome.storage.local.get({ is_active: true });
    if (is_active) await scanWithRetry();
  } catch {
    /* best effort */
  }
}, 2000);

// Live sync: a protection toggle in the popup/dashboard flips `is_active` in storage —
// reflect it in the open Gmail tab instantly, no refresh.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.is_active) return;
  if (changes.is_active.newValue === false) {
    document.querySelectorAll('[data-credmail-banner]').forEach((el) => el.remove());
    document.querySelectorAll('[data-credmail-pill]').forEach((el) => el.remove());
    document.querySelectorAll('[data-credmail-row-pill]').forEach((el) => el.remove());
    console.log('[CredMail] Protection paused — UI cleared');
  } else if (changes.is_active.newValue === true) {
    console.log('[CredMail] Protection resumed');
    void scanWithRetry();
  }
});
