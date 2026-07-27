// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P3] Outlook Web inbox row scanner — DELIBERATELY ISOLATED, same as Gmail's.
//
// Scans inbox rows for brand-spoof / blocklist hits and drops a pill. Does NOT use
// the core engine, parser, or any shared state. Reads chrome.storage.local directly.
// Disposable: delete this file + the row-scanner block in index.ts and nothing breaks.

import brands from '../../../../../data/brands.json';
import freeProviders from '../../../../../data/free-email-providers.json';

const EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;

// Fallback selectors (from the old working Outlook prototype).
const DEFAULT_ROW_SELECTORS = {
  inboxList: ['[aria-label="Message list"]', '.customScrollBar'],
  inboxRow: ['div[role="option"]', 'div[role="row"]'],
};

const ROW_MARK = 'data-credmail-row';
const ROW_PILL = 'data-credmail-row-pill';

const FREE_PROVIDERS = new Set((freeProviders as string[]).map((d) => d.toLowerCase()));
const BRAND_PATTERNS = Object.keys(brands as Record<string, string>).map(
  (b) => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
);

const ROW_PILL_BASE: Record<string, string> = {
  display: 'inline-block',
  fontSize: '11px',
  borderRadius: '10px',
  padding: '1px 6px',
  marginLeft: '6px',
  fontWeight: '600',
  verticalAlign: 'middle',
  position: 'absolute',
  right: '40px',
  top: '50%',
  transform: 'translateY(-50%)',
  zIndex: '10',
  backgroundColor: 'white',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

type PillKind = 'reported' | 'suspicious';
const ROW_PILL_VARIANTS: Record<PillKind, { text: string; style: Record<string, string> }> = {
  reported: {
    text: '🚩 Reported',
    style: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #DC2626' },
  },
  suspicious: {
    text: '⚠ Suspicious',
    style: { background: '#FFF7ED', color: '#7C2D12', border: '1px solid #ED6C02' },
  },
};

function mentionsBrand(text: string): boolean {
  if (!text) return false;
  return BRAND_PATTERNS.some((re) => re.test(text));
}

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
}

function injectRowPill(row: Element, kind: PillKind): void {
  row.querySelectorAll(`[${ROW_PILL}]`).forEach((el) => el.remove());
  const variant = ROW_PILL_VARIANTS[kind];
  const pill = document.createElement('span');
  pill.setAttribute(ROW_PILL, '');
  Object.assign(pill.style, ROW_PILL_BASE, variant.style);
  pill.textContent = variant.text;

  // Outlook rows need relative positioning for the absolute pill.
  const rowEl = row as HTMLElement;
  rowEl.style.position = 'relative';
  rowEl.appendChild(pill);
}

/**
 * Scan Outlook inbox rows for brand-spoof and blocklist hits.
 */
export async function scanOutlookRows(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get({
      dom_selectors: {},
      local_blocklist: [],
    });
    const domSelectors = stored.dom_selectors as { outlook?: Record<string, string[]> } | undefined;
    const listSelectors = domSelectors?.outlook?.inboxList ?? DEFAULT_ROW_SELECTORS.inboxList;
    const rowSelectors = domSelectors?.outlook?.inboxRow ?? DEFAULT_ROW_SELECTORS.inboxRow;

    const blocklist = new Set(
      ((stored.local_blocklist as string[]) ?? []).map((s) => s.toLowerCase()),
    );

    // Find the inbox list container.
    let listContainer: Element | null = null;
    for (const sel of listSelectors) {
      try {
        listContainer = document.querySelector(sel);
        if (listContainer) break;
      } catch { /* skip */ }
    }
    if (!listContainer) return;

    // Find rows inside the list.
    let rows: Element[] = [];
    for (const sel of rowSelectors) {
      const found = listContainer.querySelectorAll(sel);
      if (found.length > 0) {
        rows = Array.from(found);
        break;
      }
    }

    for (const row of rows) {
      if (row.getAttribute(ROW_MARK) && row.querySelector(`[${ROW_PILL}]`)) continue;
      // Clear stale pill if row was recycled.
      row.querySelectorAll(`[${ROW_PILL}]`).forEach((el) => el.remove());

      // Outlook rows: scan textContent for an email address.
      const textContent = row.textContent || '';
      const emailMatch = textContent.match(EMAIL_REGEX);
      const senderEmail = emailMatch ? emailMatch[1].toLowerCase() : '';
      if (!senderEmail) continue; // can't identify sender — skip, don't mark

      const isFreemail = FREE_PROVIDERS.has(domainOf(senderEmail));
      const isReported = blocklist.has(senderEmail);
      const isSpoof = isFreemail && mentionsBrand(textContent);

      if (isReported || isSpoof) {
        injectRowPill(row, isReported ? 'reported' : 'suspicious');
      }

      row.setAttribute(ROW_MARK, senderEmail); // mark after scan
    }
  } catch (err) {
    console.error('[Prakni] Outlook row scan failed:', err);
  }
}