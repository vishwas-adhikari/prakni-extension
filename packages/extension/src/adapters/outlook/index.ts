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
} from '../../storage/local-state';
import { startOutlookObserver } from './observer';
import { extract } from './parser';
import { injectBanner } from '../../ui/banner';
import { injectPill } from '../../ui/pill';
import { hijackBadLinks, restoreLinks } from './interceptor';
import freeProviders from '../../../../../data/free-email-providers.json';

// First line of real execution — if the content script is injected at all, this
// prints immediately, before any observer setup that could throw and swallow it.
console.log('[Prakni] outlook content script loaded');

const FREE_PROVIDERS = new Set((freeProviders as string[]).map((d) => d.toLowerCase()));

const verdictCache = new Map<string, { verdict: Verdict; senderEmail: string }>();

const BANNER_ID = 'prakni-outlook-banner';

async function incrementStat(key: 'scanned' | 'detected' | 'markedSafe'): Promise<void> {
  const stored = await chrome.storage.local.get({
    session_stats: { scanned: 0, detected: 0, markedSafe: 0 },
  });
  const session_stats = stored.session_stats as {
    scanned: number;
    detected: number;
    markedSafe: number;
  };
  session_stats[key] += 1;
  await chrome.storage.local.set({ session_stats });
}

function findSubjectElement(): HTMLElement | null {
  const selectors = [
    '[role="heading"][aria-level="2"]',
    '[id$="_SUBJECT"]',
    '[role="heading"][aria-level="3"]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el as HTMLElement;
    } catch { /* skip */ }
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
  // Remove any existing Outlook banner (idempotent).
  const existing = document.getElementById(BANNER_ID);
  if (existing) existing.remove();

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
  if (subjectEl) injectPill(verdict, subjectEl);

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
      await incrementStat('markedSafe');
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
      await incrementStat('detected');
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
    await incrementStat('scanned');
    if (verdict.riskLevel === 'Suspicious' || verdict.riskLevel === 'High Risk') {
      await incrementStat('detected');
    }
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
    !document.querySelector('.ReadingPaneContainer')
  );
}

async function scanWithRetry(): Promise<void> {
  const { scan_inbox_rows = true } = await chrome.storage.local.get({ scan_inbox_rows: true });
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