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

const ROW_PILL_STYLE: Record<string, string> = {
  display: 'inline-block',
  fontSize: '11px',
  background: '#FFF7ED',
  color: '#7C2D12',
  border: '1px solid #ED6C02',
  borderRadius: '10px',
  padding: '1px 6px',
  marginLeft: '6px',
  fontWeight: '600',
  verticalAlign: 'middle',
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

/** Insert the suspicious pill after `subjectEl`, replacing any existing row pill. */
function injectRowPill(row: Element, subjectEl: Element): void {
  row.querySelectorAll(`[${ROW_PILL}]`).forEach((el) => el.remove()); // never stack
  const pill = document.createElement('span');
  pill.setAttribute(ROW_PILL, '');
  Object.assign(pill.style, ROW_PILL_STYLE);
  pill.textContent = '⚠ Suspicious';
  subjectEl.insertAdjacentElement('afterend', pill);
}

/**
 * Scan every inbox row once and pill the suspicious ones. Best-effort: any failure is
 * swallowed so it can never throw into the MutationObserver that drives it.
 */
export async function scanInboxRows(): Promise<void> {
  try {
    console.log('[CredMail] scanInboxRows called, rows found:', document.querySelectorAll('.zA').length);
    // Read selectors + blocklist ONCE (direct storage read — not the wrapper).
    const stored = await chrome.storage.local.get({ dom_selectors: {}, local_blocklist: [] });
    const domSelectors = stored.dom_selectors as { row?: RowSelectors } | undefined;
    const sel: RowSelectors = domSelectors?.row ?? DEFAULT_ROW_SELECTORS;
    const blocklist = new Set(
      ((stored.local_blocklist as string[]) ?? []).map((s) => s.toLowerCase()),
    );

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
        console.log('[CredMail] DEBUG row skipped — no senderName element had an @ attr', {
          threadId,
        });
        continue; // not rendered yet / unidentifiable — retry next fire, don't mark
      }

      const senderEmail = sender.email;
      const senderName = (sender.el.textContent ?? '').trim();
      const subjectEl = firstEl(row, sel.subject);
      const subject = subjectEl ? (subjectEl.textContent ?? '').trim() : '';
      const isFreemail = FREE_PROVIDERS.has(domainOf(senderEmail));

      const triggered =
        blocklist.has(senderEmail.toLowerCase()) ||
        (isFreemail && mentionsBrand(senderName)) ||
        (isFreemail && mentionsBrand(subject));

      console.log('[CredMail] DEBUG row', {
        senderEmail,
        senderName,
        subject,
        domain: domainOf(senderEmail),
        isFreemail,
        hasSubjectEl: !!subjectEl,
        triggered,
      });

      if (triggered && subjectEl) injectRowPill(row, subjectEl);

      row.setAttribute(ROW_MARK, threadId); // mark only after a real scan
    }
  } catch (err) {
    console.error('[CredMail] Row scan failed:', err);
  }
}
