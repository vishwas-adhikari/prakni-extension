// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P3] Outlook Web content script entry. Mirrors Gmail's index.ts pattern:
// Observe → extract → score → render, on-device.
//
// OUTLOOK-SPECIFIC: Outlook renders the banner via a thin wrapper (renderOutlookBanner)
// that inserts an empty <div> BEFORE the body container, then hands it to the SHARED
// injectBanner from ui/banner.ts — so Outlook and Gmail render the exact same banner
// (custom PNG icons, two-column layout).

import { analyzeEmail, type Verdict } from '@credmail/core';
import {
  getState,
  addToWhitelist,
  addToSafeContacts,
  addToBlocklist,
  incrementStat,
  getScanRows,
} from '../../storage/local-state';
import { startOutlookObserver } from './observer';
import { extract } from './parser';
import { injectBanner, isBannerTransitioning } from '../../ui/banner';
import { injectPill } from '../../ui/pill';
import { hijackBadLinks, restoreLinks } from './interceptor';
import { recordThreat } from '../../storage/threats';
import freeProviders from '../../../../../data/free-email-providers.json';

// First line of real execution — if the content script is injected at all, this
// prints immediately, before any observer setup that could throw and swallow it.
console.log('[Prakni] outlook content script loaded');

const FREE_PROVIDERS = new Set((freeProviders as string[]).map((d) => d.toLowerCase()));

const verdictCache = new Map<string, { verdict: Verdict; senderEmail: string }>();

const BANNER_ID = 'prakni-outlook-banner';

// The reading-pane subject heading — scoped to #ConversationReadingPaneContainer and
// selected by CONTENT shape (not email / "To:" / date / "[Draft]"), so it survives
// Outlook's hashed class names. This is where the risk pill anchors (right of the
// subject title, in the header bar). Unscoped document.querySelector previously grabbed
// a left-rail heading, putting the pill on the far left.
function findSubjectElement(): HTMLElement | null {
  const scope =
    document.querySelector('#ConversationReadingPaneContainer') ||
    document.querySelector('[aria-label="Email message"]');
  if (!scope) return null;
  const EMAIL = /[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+/;
  const isSubjectText = (t: string): boolean =>
    !!t &&
    !EMAIL.test(t) &&
    !/^to:/i.test(t) &&
    t !== '[Draft]' &&
    !/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(t) &&
    !/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.*\d/.test(t);
  for (const h of Array.from(scope.querySelectorAll('[role="heading"][aria-level="3"]'))) {
    const t = ((h as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
    if (isSubjectText(t)) return h as HTMLElement;
  }
  return null;
}

async function getOutlookSelectors(): Promise<Record<string, string[]>> {
  const stored = await chrome.storage.local.get({ dom_selectors: {} });
  const selectors = stored.dom_selectors as Record<string, unknown>;
  const outlook = selectors?.outlook as Record<string, string[]> | undefined;
  return outlook ?? {};
}

async function getOtaContainerSelectors(): Promise<string[]> {
  const outlook = await getOutlookSelectors();
  return outlook.container ?? [];
}

/**
 * Render the Outlook banner using the SHARED injectBanner (identical design to Gmail:
 * custom PNG icons, two-column layout). Outlook has no stable "insert as firstChild"
 * host, so we drop an empty wrapper <div> BEFORE the body container and let injectBanner
 * build the banner inside it. Idempotent: any prior wrapper is removed first, and the
 * body element is re-found each render (Outlook's SPA swaps it) so the banner always
 * sits above the current body.
 */
function renderOutlookBanner(
  verdict: Verdict,
  senderEmail: string,
  onMarkSafe: (senderEmail: string) => void,
  onReport: (senderEmail: string) => void,
): void {
  // Remove any existing Outlook banner (idempotent) — BUT never during a Mark-Safe
  // green transition, or the fade gets destroyed before it finishes (Gmail's shared
  // container path is already guarded inside injectBanner; our separate wrapper isn't).
  const existing = document.getElementById(BANNER_ID);
  if (existing) {
    if (isBannerTransitioning(existing)) return;
    existing.remove();
  }

  if (verdict.silent) return;

  // Find the body container to inject BEFORE (re-found each render — Outlook's SPA
  // swaps the body node).
  const bodyEl =
    document.querySelector('[data-test-id="mailMessageBodyContainer"]') ||
    document.querySelector('.BodyFragment') ||
    document.querySelector('div[role="document"]') ||
    document.querySelector('[aria-label="Email message"]');

  if (!bodyEl || !bodyEl.parentElement) {
    console.warn('[Prakni] Outlook: no banner anchor found');
    return;
  }

  // Empty wrapper, inserted BEFORE the body; injectBanner builds the banner inside it.
  const wrapper = document.createElement('div');
  wrapper.id = BANNER_ID;
  Object.assign(wrapper.style, {
    width: '100%',
    marginBottom: '12px',
    boxSizing: 'border-box',
  });
  bodyEl.parentElement.insertBefore(wrapper, bodyEl);

  // Shared banner — same design as Gmail.
  injectBanner(verdict, wrapper, senderEmail, onMarkSafe, onReport);
}

async function render(
  verdict: Verdict,
  container: Element,
  senderEmail: string,
  onMarkSafe: (senderEmail: string) => void,
  onReport: (senderEmail: string) => void,
): Promise<void> {
  renderOutlookBanner(verdict, senderEmail, onMarkSafe, onReport);

  const subjectEl = findSubjectElement();
  if (subjectEl) {
    injectPill(verdict, subjectEl);
    // Outlook-only: the shared pill can wrap ("High Risk" → 2 lines) when the subject
    // flex row squeezes it. Keep it on one line with breathing room, scoped to the
    // reading-pane pill so Gmail's pill (which renders fine) is never touched.
    const scope = document.querySelector('#ConversationReadingPaneContainer');
    const pill = scope?.querySelector('[data-credmail-pill]') as HTMLElement | null;
    if (pill) {
      Object.assign(pill.style, {
        whiteSpace: 'nowrap',
        flexShrink: '0',
        padding: '2px 10px',
        marginLeft: '12px',
      });
    }
  }

  const el = container as HTMLElement;
  if (verdict.silent) {
    restoreLinks(el);
  } else {
    const badLinks = verdict.reasons.flatMap((r) => r.affectedLinks ?? []);
    const reasons = verdict.reasons.map((r) => r.description);
    hijackBadLinks(el, badLinks, reasons);
  }
}

// --- Main observer callback ---
startOutlookObserver(
  async (messageId, container) => {
    const onMarkSafe = async (senderEmail: string): Promise<void> => {
      restoreLinks(container as HTMLElement);
      const domain = senderEmail.split('@')[1]?.toLowerCase() ?? '';
      if (domain) {
        if (FREE_PROVIDERS.has(domain)) await addToSafeContacts(senderEmail);
        else await addToWhitelist(domain);
      }
      await incrementStat('outlook', 'markedSafe');
      const outlookSelectors = await getOutlookSelectors();
      const fresh = await extract(container, messageId, outlookSelectors);
      if (!fresh) {
        console.warn(`[Prakni] Outlook Mark Safe re-score skipped for ${messageId}`);
        return;
      }
      const state = await getState();
      const whitelist = [...state.local_whitelist, ...state.safe_contacts];
      const verdict = analyzeEmail(fresh, state.scoring_config, whitelist);
      verdictCache.set(messageId, { verdict, senderEmail: fresh.senderEmail });
      await render(verdict, container, fresh.senderEmail, onMarkSafe, onReport);
    };

    const onReport = async (senderEmail: string): Promise<void> => {
      await addToBlocklist(senderEmail);
      await incrementStat('outlook', 'detected');
      console.log('[Prakni] Outlook Reported:', senderEmail);
    };

    const cached = verdictCache.get(messageId);
    if (cached) {
      console.log(
        `[Prakni] Outlook cache hit for ${messageId}: ${cached.verdict.riskLevel} (${cached.verdict.score})`,
      );
      await render(cached.verdict, container, cached.senderEmail, onMarkSafe, onReport);
      return;
    }

    const state = await getState();
    if (!state.is_active) return;

    const outlookSelectors = await getOutlookSelectors();
    const emailData = await extract(container, messageId, outlookSelectors);
    if (!emailData) return;

    const whitelist = [...state.local_whitelist, ...state.safe_contacts];
    const verdict = analyzeEmail(emailData, state.scoring_config, whitelist);
    verdictCache.set(messageId, { verdict, senderEmail: emailData.senderEmail });
    console.log(
      `[Prakni] Outlook Verdict for ${messageId}: ${verdict.riskLevel} (${verdict.score})`,
    );
    await incrementStat('outlook', 'scanned');
    if (verdict.riskLevel === 'Suspicious' || verdict.riskLevel === 'High Risk') {
      await incrementStat('outlook', 'detected');
    }
    // Record the flagged email locally (Option C) for inbox-row reflection — display
    // state only; never touches the scanned/detected counters above.
    await recordThreat('outlook', emailData.senderEmail, emailData.subject, verdict);
    await render(verdict, container, emailData.senderEmail, onMarkSafe, onReport);
  },
  getOtaContainerSelectors,
);

// --- Outlook inbox row scanner (ISOLATED, disposable) -------------------------
import { scanOutlookRows } from './row-scanner';

const ROW_SCAN_DEBOUNCE_MS = 800;

function isListView(): boolean {
  return (
    !document.querySelector('[aria-label="Email message"]') &&
    !document.querySelector('[data-test-id="mailMessageBodyContainer"]') &&
    !document.querySelector('.ReadingPaneContainer') &&
    !document.querySelector('#ConversationReadingPaneContainer') &&
    !document.querySelector('.BodyFragment') &&
    !document.querySelector("div[role='document']")
  );
}

async function scanWithRetry(): Promise<void> {
  const scan_inbox_rows = await getScanRows();
  if (!scan_inbox_rows) return;
  await scanOutlookRows();
  setTimeout(async () => {
    try { await scanOutlookRows(); } catch { /* best effort */ }
  }, 1500);
}

let rowScanTimer: number | undefined;
new MutationObserver(() => {
  if (rowScanTimer !== undefined) clearTimeout(rowScanTimer);
  rowScanTimer = window.setTimeout(async () => {
    try {
      const { is_active } = await chrome.storage.local.get({ is_active: true });
      if (is_active && isListView()) await scanWithRetry();
    } catch { /* best effort */ }
  }, ROW_SCAN_DEBOUNCE_MS);
}).observe(document.body, { childList: true, subtree: true });

setTimeout(async () => {
  if (!isListView()) return;
  try {
    const { is_active } = await chrome.storage.local.get({ is_active: true });
    if (is_active) await scanWithRetry();
  } catch { /* best effort */ }
}, 2500);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.is_active) return;
  if (changes.is_active.newValue === false) {
    const b = document.getElementById(BANNER_ID);
    if (b) b.remove();
    document.querySelectorAll('[data-credmail-pill]').forEach((el) => el.remove());
    document.querySelectorAll('[data-credmail-row-pill]').forEach((el) => el.remove());
    console.log('[Prakni] Outlook Protection paused — UI cleared');
  } else if (changes.is_active.newValue === true) {
    console.log('[Prakni] Outlook Protection resumed');
    void scanWithRetry();
  }
});