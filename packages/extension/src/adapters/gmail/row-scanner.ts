// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P1] Lightweight inbox-row scanner — DELIBERATELY ISOLATED from the detection
// pipeline. It does NOT touch core, the parser, the open-email observer, the cache,
// the storage wrapper, or the banner/pill modules. It reads three cheap signals off
// each inbox row and drops a single "⚠ Suspicious" pill when one fires.
//
// Disposable by design: delete this file + the appended block in index.ts and the
// rest of the extension is unaffected. Reads chrome.storage.local directly (one get)
// and imports the brand / freemail lists directly — no shared wrappers.
//
// CSP discipline (MV3): styles via Object.assign, nodes via createElement + textContent.

import brands from '../../../../../data/brands.json';
import freeProviders from '../../../../../data/free-email-providers.json';
import { getThreatMatchers, reflectRow } from '../../storage/threats';

// Fallback defaults — primary source is OTA via chrome.storage.local dom_selectors.row
const DEFAULT_ROW_SELECTORS = {
  container: '.zA',
  senderName: ['.yX', '.zF', '.bA4', 'span[email]'],
  senderEmail: ['email', 'data-hovercard-id'],
  subject: ['.bog', '.bqe', '.y6 span'],
  threadIdAttrs: ['id', 'data-legacy-thread-id'],
};

type RowSelectors = typeof DEFAULT_ROW_SELECTORS;

const ROW_MARK = 'data-credmail-row';
const ROW_PILL = 'data-credmail-row-pill';

// Static lists (read once at module load).
const FREE_PROVIDERS = new Set((freeProviders as string[]).map((d) => d.toLowerCase()));
// Precompiled word-boundary brand patterns — mirrors core's mentionedBrands logic,
// replicated locally so this file imports nothing from @credmail/core.
const BRAND_PATTERNS = Object.keys(brands as Record<string, string>).map(
  (b) => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
);

// Content-signal patterns — replicated locally (this file imports nothing from core,
// same as BRAND_PATTERNS). Mirror of core's urgency/financial/credential rules; DELIVERY
// is row-local (no core delivery rule yet). Used for the corroboration heuristic below.
const URGENCY_PATTERNS: RegExp[] = [
  /\bact (now|immediately|fast)\b/i,
  /\b(within|in) \d+ ?(hours?|minutes?|hrs?)\b/i,
  /\bimmediate(ly)? (action|attention) (required|needed)\b/i,
  /\b(account|access) (will be|has been) (suspended|blocked|locked|deactivated)\b/i,
  /\b(urgent|final notice|last warning)\b/i,
  /\bbefore it'?s too late\b/i,
  /\bverify (now|immediately)\b/i,
  /\bexpires? in\b/i,
];
const FINANCIAL_PATTERNS: RegExp[] = [
  /\bwire transfer\b/i,
  /\bgift cards?\b/i,
  /\b(bitcoin|crypto(currency)?|usdt|ethereum)\b/i,
  /\b(share|send|update|verify|confirm) your (bank|card|account)(?:\s+\w+){0,2} (details|number|information)\b/i,
  /\bpayment (failed|declined|could not be processed)\b/i,
  /\b(tax|gst) (refund|notice|demand)\b/i,
  /\b(kyc|pan) (update|verification|pending)\b/i,
  /\bclaim your (refund|reward|prize)\b/i,
];
const CREDENTIAL_PATTERNS: RegExp[] = [
  /verify your (account|identity|email|details)/i,
  /confirm your (account|identity|password|details)/i,
  /update your (password|account|billing|payment)/i,
  /(sign|log) ?in to (your|verify)/i,
  /(unlock|re-?activate|restore) your account/i,
  /your account (has been|will be) (suspended|locked|disabled|deactivated)/i,
  /\baccount verification\b/i,
  /\baccount update\b/i,
];
const DELIVERY_PATTERNS: RegExp[] = [
  /\b(package|parcel|shipment|delivery)\b.*\b(could not|failed|held|pending|reschedule|confirm)\b/i,
  /\b(could not|failed to|unable to) (deliver|be delivered)\b/i,
  /\bcustoms (fee|clearance|charge)\b/i,
];

/** How many CONTENT-signal categories fire in `text` (brand/urgency/financial/credential/delivery). */
function contentSignalCount(text: string): number {
  if (!text) return 0;
  let n = 0;
  if (mentionsBrand(text)) n++;
  if (URGENCY_PATTERNS.some((re) => re.test(text))) n++;
  if (FINANCIAL_PATTERNS.some((re) => re.test(text))) n++;
  if (CREDENTIAL_PATTERNS.some((re) => re.test(text))) n++;
  if (DELIVERY_PATTERNS.some((re) => re.test(text))) n++;
  return n;
}

// Shared pill layout; colour/text vary by which check fired.
const ROW_PILL_BASE: Record<string, string> = {
  display: 'inline-block',
  fontSize: '11px',
  borderRadius: '10px',
  padding: '1px 6px',
  marginLeft: '6px',
  fontWeight: '600',
  verticalAlign: 'middle',
};

type PillKind = 'reported' | 'suspicious' | 'highrisk';
const ROW_PILL_VARIANTS: Record<PillKind, { text: string; style: Record<string, string> }> = {
  // Blocklist hit — the user's explicit flag; takes priority over a heuristic spoof.
  reported: {
    text: '🚩 Reported',
    style: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #DC2626' },
  },
  // Brand-spoof heuristic (sender name or subject).
  suspicious: {
    text: '⚠ Suspicious',
    style: { background: '#FFF7ED', color: '#7C2D12', border: '1px solid #ED6C02' },
  },
  // Real High-Risk verdict reflected from an opened email.
  highrisk: {
    text: '🚨 High Risk',
    style: { background: '#FEF2F2', color: '#7F1D1D', border: '1px solid #C62828' },
  },
};

/** True if any known brand keyword appears in `text` (word-boundary match). */
function mentionsBrand(text: string): boolean {
  if (!text) return false;
  return BRAND_PATTERNS.some((re) => re.test(text));
}

/** Registrable-ish domain of an email address (lowercased), or "". */
function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
}

/** First non-empty value among `attrs` on `el`. */
function firstAttr(el: Element, attrs: string[]): string {
  for (const attr of attrs) {
    const v = (el.getAttribute(attr) ?? '').trim();
    if (v) return v;
  }
  return '';
}

/**
 * The sender: walk the senderName selectors and keep the FIRST matched element that
 * actually carries an email-bearing attribute (an `@`). We don't stop at the first
 * selector match — a row's outer span may match but lack the address.
 */
function findSender(
  row: Element,
  sel: RowSelectors,
): { el: Element; email: string } | null {
  for (const selector of sel.senderName) {
    for (const el of Array.from(row.querySelectorAll(selector))) {
      for (const attr of sel.senderEmail) {
        const v = (el.getAttribute(attr) ?? '').trim();
        if (v.includes('@')) return { el, email: v };
      }
    }
  }
  return null;
}

/** First element matching any of `selectors` within `row`. */
function firstEl(row: Element, selectors: string[]): Element | null {
  for (const selector of selectors) {
    const el = row.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/** Insert a row pill (of `kind`) after `subjectEl`, replacing any existing row pill. */
function injectRowPill(row: Element, subjectEl: Element, kind: PillKind): void {
  row.querySelectorAll(`[${ROW_PILL}]`).forEach((el) => el.remove()); // never stack
  const variant = ROW_PILL_VARIANTS[kind];
  const pill = document.createElement('span');
  pill.setAttribute(ROW_PILL, '');
  Object.assign(pill.style, ROW_PILL_BASE, variant.style);
  pill.textContent = variant.text;
  subjectEl.insertAdjacentElement('afterend', pill);
}

/**
 * Scan every inbox row once and pill the suspicious ones. Best-effort: any failure is
 * swallowed so it can never throw into the MutationObserver that drives it.
 */
export async function scanInboxRows(): Promise<void> {
  try {
    // Read selectors + blocklist ONCE (direct storage read — not the wrapper).
    const stored = await chrome.storage.local.get({ dom_selectors: {}, local_blocklist: [] });
    const domSelectors = stored.dom_selectors as { row?: RowSelectors } | undefined;
    const sel: RowSelectors = domSelectors?.row ?? DEFAULT_ROW_SELECTORS;
    const blocklist = new Set(
      ((stored.local_blocklist as string[]) ?? []).map((s) => s.toLowerCase()),
    );
    const matchers = await getThreatMatchers('gmail');

    for (const row of Array.from(document.querySelectorAll(sel.container))) {
      const threadId = firstAttr(row, sel.threadIdAttrs);

      const prev = row.getAttribute(ROW_MARK);
      // Skip only if scanned AND our pill is still physically present — Gmail re-renders
      // row contents (destroying the pill span) while keeping the row + its mark.
      if (prev === threadId && row.querySelector(`[${ROW_PILL}]`) !== null) continue;
      if (prev !== null) {
        // Row recycled by virtual scroll — clear the stale pill and re-scan.
        row.querySelectorAll(`[${ROW_PILL}]`).forEach((el) => el.remove());
      }

      const sender = findSender(row, sel);
      if (!sender) {
        continue; // not rendered yet / unidentifiable — retry next fire, don't mark
      }

      const senderEmail = sender.email;
      const senderName = (sender.el.textContent ?? '').trim();
      const subjectEl = firstEl(row, sel.subject);
      const subject = subjectEl ? (subjectEl.textContent ?? '').trim() : '';

      // 1) Reported (user's explicit flag) wins over everything. Containment match:
      // flag the row if a blocklisted address is the sender OR appears anywhere in the
      // row text (e.g. a forwarded "From:" line). Blocklist is global → works cross-provider.
      const rowTextLower = (row.textContent || '').toLowerCase();
      const isReported =
        blocklist.has(senderEmail.toLowerCase()) ||
        [...blocklist].some((addr) => addr && rowTextLower.includes(addr));
      if (isReported && subjectEl) {
        injectRowPill(row, subjectEl, 'reported');
        row.setAttribute(ROW_MARK, threadId);
        continue;
      }

      // 2) Real verdict (from opening the email) supersedes the spoof heuristic.
      const reflected = reflectRow(matchers, senderEmail, row.textContent || '');
      if (reflected && subjectEl) {
        injectRowPill(row, subjectEl, reflected === 'High Risk' ? 'highrisk' : 'suspicious');
        row.setAttribute(ROW_MARK, threadId);
        continue;
      }

      // 3) Spoof heuristic.
      // Corroboration heuristic: pill only when the sender is freemail AND at least one
      // content signal (brand/urgency/financial/credential/delivery) fires. Freemail alone
      // never pills; a content signal alone never pills. Validated on a real inbox.
      const isFreemail = FREE_PROVIDERS.has(domainOf(senderEmail));
      const isSpoof = isFreemail && contentSignalCount(`${senderName} ${subject}`) >= 1;
      if (isSpoof && subjectEl) {
        injectRowPill(row, subjectEl, 'suspicious');
      }

      row.setAttribute(ROW_MARK, threadId); // mark only after a real scan
    }
  } catch (err) {
    console.error('[CredMail] Row scan failed:', err);
  }
}
