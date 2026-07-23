// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P1.5] Link Shield — click interception by href rewrite.
//
// Instead of listening for clicks (which misses middle-click, right-click "open in
// new tab", copy-paste and drag), we rewrite the href of flagged links in the Gmail
// DOM so they point at the extension's local warning page. Every way of opening the
// link then routes through the warning first — no webNavigation/webRequest permission.
//
// ONLY links the engine flagged (verdict.reasons[].affectedLinks) are touched; every
// other link is left exactly as Gmail rendered it. restoreLinks() fully reverses a
// hijack (used on Mark Safe and on the Safe/silent render path).
//
// CSP discipline: styling via Object.assign only.

import { unwrapGoogleRedirect } from '../shared/extract-links';

const ORIGINAL_HREF_ATTR = 'data-credmail-original-href';

// The capture-phase click handler is stashed on the element so restoreLinks can
// remove the exact same reference (removeEventListener needs identity + phase).
type HijackedAnchor = HTMLAnchorElement & { __credmailHandler?: (e: Event) => void };

/** Lowercased, query-stripped form used to match a DOM link against the engine's
 * affectedLinks (which are already unwrapped real URLs). */
function normalizeForMatch(url: string): string {
  return url.split('?')[0].toLowerCase();
}

/** The subtle red dashed underline that marks a hijacked link. */
const HIJACKED_STYLE: Record<string, string> = {
  borderBottom: '2px dashed #DC2626',
  textDecoration: 'none',
};

/**
 * Rewrite every flagged link inside `container` to route through the warning page.
 *
 * @param container      the message body element
 * @param affectedLinks  unwrapped real URLs the engine flagged
 * @param reasons        verdict reason descriptions, shown on the warning page
 */
export function hijackBadLinks(
  container: HTMLElement,
  affectedLinks: string[],
  reasons: string[] = [],
): void {
  if (affectedLinks.length === 0) return;

  const flagged = new Set(affectedLinks.map(normalizeForMatch));
  const reasonsParam = encodeURIComponent(JSON.stringify(reasons));

  for (const a of Array.from(container.querySelectorAll('a[href]'))) {
    // Already hijacked (e.g. a cache-hit re-render fired us again) — skip so we
    // never overwrite the saved original with our own warning URL.
    if (a.hasAttribute(ORIGINAL_HREF_ATTR)) continue;

    // Gmail wraps every link through https://www.google.com/url?q=<real>. The
    // engine's affectedLinks are the unwrapped reals, so unwrap before matching.
    const rawHref = (a as HTMLAnchorElement).href;
    const realUrl = unwrapGoogleRedirect(rawHref);
    if (!flagged.has(normalizeForMatch(realUrl))) continue;

    // Save the ORIGINAL (wrapped) href for an exact restore. The warning page gets
    // the UNWRAPPED real URL as ?target= so it can display a meaningful host and
    // "Proceed Anyway" navigates straight to the real destination.
    a.setAttribute(ORIGINAL_HREF_ATTR, rawHref);
    const warningUrl =
      chrome.runtime.getURL('warning.html') +
      '?target=' +
      encodeURIComponent(realUrl) +
      '&reasons=' +
      reasonsParam;
    (a as HTMLAnchorElement).href = warningUrl;
    Object.assign((a as HTMLElement).style, HIJACKED_STYLE);

    // Gmail's own JS click handler reads its internal data model, not the DOM href,
    // so the rewrite alone gets bypassed. Register a CAPTURE-phase listener (true):
    // it fires before Gmail's bubbling-phase handler, and stopImmediatePropagation
    // prevents that handler from running at all — we open the warning ourselves.
    const handler = (e: Event): void => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      window.open(warningUrl, '_blank');
    };
    a.addEventListener('click', handler, true);
    (a as HijackedAnchor).__credmailHandler = handler;
  }
}

/**
 * Undo every hijack inside `container`: restore the original href and clear the
 * marker attribute + the red underline. Safe to call when nothing was hijacked.
 */
export function restoreLinks(container: HTMLElement): void {
  for (const a of Array.from(container.querySelectorAll(`a[${ORIGINAL_HREF_ATTR}]`))) {
    const original = a.getAttribute(ORIGINAL_HREF_ATTR);
    if (original !== null) (a as HTMLAnchorElement).href = original;
    a.removeAttribute(ORIGINAL_HREF_ATTR);
    Object.assign((a as HTMLElement).style, { borderBottom: '', textDecoration: '' });

    // Tear down the capture-phase click handler (same reference + phase as attached).
    const anchor = a as HijackedAnchor;
    const handler = anchor.__credmailHandler;
    if (handler) {
      anchor.removeEventListener('click', handler, true);
      delete anchor.__credmailHandler;
    }
  }
}
