// [P1] Shared link extraction. Given a message container, pull the anchors the
// engine needs to compare link text against destination (docs/detection.md rules).

import { cleanText } from './clean-text';

export interface ExtractedLink {
  text: string;
  url: string;
}

/**
 * All real hyperlinks inside `container`, as { text, url }. Empty hrefs, in-page
 * anchors (`#…`) and `javascript:` pseudo-links are dropped — none point to a host
 * the engine could judge.
 */
export function extractLinks(container: Element): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  for (const a of Array.from(container.querySelectorAll('a'))) {
    const url = (a.getAttribute('href') ?? '').trim();
    if (!url) continue;
    if (url.startsWith('#')) continue;
    if (url.toLowerCase().startsWith('javascript:')) continue;
    links.push({
      text: cleanText((a as HTMLElement).innerText ?? a.textContent ?? ''),
      url,
    });
  }
  return links;
}
