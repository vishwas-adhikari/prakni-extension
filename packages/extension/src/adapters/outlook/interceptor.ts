// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// [P3] Outlook Link Shield — identical logic to Gmail's interceptor.ts.
//
// Rewritten as a separate file (not imported from gmail/) to maintain adapter
// isolation: a Gmail change should never break Outlook. The logic is the same —
// href rewrite + capture-phase click handler + restoreLinks on Mark Safe.

import { unwrapGoogleRedirect } from '../shared/extract-links';

const ORIGINAL_HREF_ATTR = 'data-credmail-original-href';

type HijackedAnchor = HTMLAnchorElement & { __credmailHandler?: (e: Event) => void };

function normalizeForMatch(url: string): string {
  return url.split('?')[0].toLowerCase();
}

const HIJACKED_STYLE: Record<string, string> = {
  borderBottom: '2px dashed #DC2626',
  textDecoration: 'none',
};

export function hijackBadLinks(
  container: HTMLElement,
  affectedLinks: string[],
  reasons: string[] = [],
): void {
  if (affectedLinks.length === 0) return;

  const flagged = new Set(affectedLinks.map(normalizeForMatch));
  const reasonsParam = encodeURIComponent(JSON.stringify(reasons));

  for (const a of Array.from(container.querySelectorAll('a[href]'))) {
    if (a.hasAttribute(ORIGINAL_HREF_ATTR)) continue;

    const rawHref = (a as HTMLAnchorElement).href;
    // Outlook may also wrap links through redirects — unwrap before matching.
    const realUrl = unwrapGoogleRedirect(rawHref);
    if (!flagged.has(normalizeForMatch(realUrl))) continue;

    a.setAttribute(ORIGINAL_HREF_ATTR, rawHref);
    const warningUrl =
      chrome.runtime.getURL('warning.html') +
      '?target=' +
      encodeURIComponent(realUrl) +
      '&reasons=' +
      reasonsParam;
    (a as HTMLAnchorElement).href = warningUrl;
    Object.assign((a as HTMLElement).style, HIJACKED_STYLE);

    // Capture-phase listener — fires before Outlook's own click handler.
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

export function restoreLinks(container: HTMLElement): void {
  for (const a of Array.from(container.querySelectorAll(`a[${ORIGINAL_HREF_ATTR}]`))) {
    const original = a.getAttribute(ORIGINAL_HREF_ATTR);
    if (original !== null) (a as HTMLAnchorElement).href = original;
    a.removeAttribute(ORIGINAL_HREF_ATTR);
    Object.assign((a as HTMLElement).style, { borderBottom: '', textDecoration: '' });

    const anchor = a as HijackedAnchor;
    const handler = anchor.__credmailHandler;
    if (handler) {
      anchor.removeEventListener('click', handler, true);
      delete anchor.__credmailHandler;
    }
  }
}