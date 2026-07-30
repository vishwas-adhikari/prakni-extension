// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P3] Outlook Web inbox row scanner — DELIBERATELY ISOLATED, same as Gmail's.
//
// Scans inbox rows for brand-spoof / blocklist hits and drops a pill. Does NOT use
// the core engine, parser, or any shared state. Reads chrome.storage.local directly.
// Disposable: delete this file + the row-scanner block in index.ts and nothing breaks.

import brands from '../../../../../data/brands.json';
import freeProviders from '../../../../../data/free-email-providers.json';
import { getThreatMatchers, reflectRow } from '../../storage/threats';

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
  fontWeight: '600',
  whiteSpace: 'nowrap',
  position: 'absolute',
  right: '90px', // fallback; injectRowPill overrides from the live timestamp position
  top: '6px', // top (sender-name) line, NOT centered onto the subject line
  zIndex: '10',
  backgroundColor: 'white',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

type PillKind = 'reported' | 'suspicious' | 'highrisk';
const ROW_PILL_VARIANTS: Record<PillKind, { text: string; style: Record<string, string> }> = {
  reported: {
    text: '🚩 Reported',
    style: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #DC2626' },
  },
  suspicious: {
    text: '⚠ Suspicious',
    style: { background: '#FFF7ED', color: '#7C2D12', border: '1px solid #ED6C02' },
  },
  highrisk: {
    text: '🚨 High Risk',
    style: { background: '#FEF2F2', color: '#7F1D1D', border: '1px solid #C62828' },
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

/** The timestamp-shaped node in a row (top-right), used to place the pill just left of it. */
function findTimestamp(row: Element): HTMLElement | null {
  const isTime = (t: string): boolean =>
    t.length <= 14 &&
    /^(\d{1,2}:\d{2}\s?(AM|PM)|(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}:\d{2}\s?(AM|PM)|(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4})$/i.test(t);
  for (const el of Array.from(row.querySelectorAll('span, div'))) {
    const t = ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
    const r = el.getBoundingClientRect();
    if (isTime(t) && r.width > 0 && r.width < 120) return el as HTMLElement;
  }
  return null;
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

  // Sit on the TOP (sender-name) line, just LEFT of the timestamp. The horizontal
  // offset is computed from the live timestamp node so it clears any date width
  // ("2:58 PM" vs "Fri 12:51 AM") instead of a fixed guess; top stays 6px (name line,
  // above the subject). Falls back to ROW_PILL_BASE.right if no timestamp is found.
  const time = findTimestamp(row);
  if (time) {
    const rowRect = rowEl.getBoundingClientRect();
    const timeRect = time.getBoundingClientRect();
    const gap = 12;
    pill.style.right = `${Math.round(rowRect.right - timeRect.left + gap)}px`;
  }

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
    const matchers = await getThreatMatchers('outlook');

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

      // Outlook rows: prefer a [title] attribute carrying the address (present even
      // when the row's visible text has none), then fall back to the visible text.
      const textContent = row.textContent || '';
      let senderEmail = '';
      for (const el of Array.from(row.querySelectorAll('[title]'))) {
        const m = (el.getAttribute('title') || '').match(EMAIL_REGEX);
        if (m) { senderEmail = m[1].toLowerCase(); break; }
      }
      if (!senderEmail) {
        const emailMatch = textContent.match(EMAIL_REGEX);
        senderEmail = emailMatch ? emailMatch[1].toLowerCase() : '';
      }
      if (!senderEmail) continue; // can't identify sender — skip, don't mark

      // Real verdict (from opening the email) supersedes the row heuristic.
      const reflected = reflectRow(matchers, senderEmail, row.textContent || '');
      if (reflected) {
        injectRowPill(row, reflected === 'High Risk' ? 'highrisk' : 'suspicious');
        row.setAttribute(ROW_MARK, senderEmail);
        continue; // real verdict shown — skip heuristic for this row
      }

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