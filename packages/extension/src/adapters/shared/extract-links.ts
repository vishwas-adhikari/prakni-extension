// [P1] Shared link extraction. Given a message container, pull the anchors the
// engine needs to compare link text against destination (docs/detection.md rules).

import { cleanText } from './clean-text';

export interface ExtractedLink {
  text: string;
  url: string;
}

/**
 * Gmail routes every outbound link through a `https://www.google.com/url?q=<real>`
 * redirect. Left wrapped, EVERY link looks like google.com and the link-mismatch /
 * lookalike rules go blind. Unwrap to the real destination in the `q` param. Parsing
 * is in a try/catch — a relative or malformed href is left untouched, not dropped.
 */
function unwrapGoogleRedirect(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.endsWith('google.com') &&
      parsed.pathname === '/url' &&
      parsed.searchParams.has('q')
    ) {
      return parsed.searchParams.get('q') ?? url;
    }
  } catch {
    /* not a parseable absolute URL — leave as-is */
  }
  return url;
}

/**
 * All real hyperlinks inside `container`, as { text, url }. Empty hrefs, in-page
 * anchors (`#…`) and `javascript:` pseudo-links are dropped — none point to a host
 * the engine could judge. `<area>` (image-map) links count too. Google redirect
 * wrappers are unwrapped, and duplicates (by final URL) are collapsed.
 */
export function extractLinks(container: Element): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(container.querySelectorAll('a[href], area[href]'))) {
    const raw = (a.getAttribute('href') ?? '').trim();
    if (!raw) continue;
    if (raw.startsWith('#')) continue;
    if (raw.toLowerCase().startsWith('javascript:')) continue;
    const url = unwrapGoogleRedirect(raw);
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({
      text: cleanText((a as HTMLElement).innerText ?? a.textContent ?? ''),
      url,
    });
  }
  return links;
}
