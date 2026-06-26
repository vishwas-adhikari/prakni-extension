// [P1] Reading-pane warning banner (docs/design.md "Reading-pane banner").
//
// Shown for Suspicious / High Risk only — Safe stays silent. Every node is built
// with createElement + textContent (never innerHTML: XSS + MV3 CSP) and styled with
// Object.assign (never CSS strings / <style> / classList). Self-contained: it takes
// a local VerdictView and an onMarkSafe callback, and imports nothing from core.

import {
  VerdictView,
  bannerBase,
  bannerSuspicious,
  bannerHighRisk,
  bannerHeader,
  reasonList,
  reasonItem,
  affectedLink,
  buttonRow,
  button,
  footer,
} from './styles';

const BANNER_ATTR = 'data-credmail-banner';
const LINK_MAX = 60;

/** Drop the query string (privacy: CLAUDE.md) and truncate for display. */
function displayUrl(url: string): string {
  const stripped = url.split('?')[0];
  return stripped.length > LINK_MAX ? stripped.slice(0, LINK_MAX) + '…' : stripped;
}

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  Object.assign(btn.style, button);
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Render (or clear) the banner at the top of `container`. Idempotent: any existing
 * banner is removed first, so re-rendering replaces rather than stacks.
 */
export function injectBanner(
  verdict: VerdictView,
  container: HTMLElement,
  senderEmail: string,
  onMarkSafe: (domain: string) => void,
): void {
  // Idempotent + silent-clear: always remove a prior banner first.
  container.querySelectorAll(`[${BANNER_ATTR}]`).forEach((el) => el.remove());
  if (verdict.silent) return;

  const isHighRisk = verdict.riskLevel === 'High Risk';

  const banner = document.createElement('div');
  banner.setAttribute(BANNER_ATTR, '');
  Object.assign(banner.style, bannerBase, isHighRisk ? bannerHighRisk : bannerSuspicious);

  // Header: icon + title with score.
  const header = document.createElement('div');
  Object.assign(header.style, bannerHeader);
  header.textContent = `${isHighRisk ? '🚨' : '⚠️'} Potential Phishing Indicators Found (${verdict.score}/100)`;
  banner.appendChild(header);

  // Reasons + any affected links.
  const list = document.createElement('ul');
  Object.assign(list.style, reasonList);
  for (const reason of verdict.reasons) {
    const li = document.createElement('li');
    Object.assign(li.style, reasonItem);
    li.textContent = reason.description;
    for (const link of reason.affectedLinks ?? []) {
      const linkEl = document.createElement('div');
      Object.assign(linkEl.style, affectedLink);
      linkEl.textContent = displayUrl(link);
      li.appendChild(linkEl);
    }
    list.appendChild(li);
  }
  banner.appendChild(list);

  // Actions.
  const actions = document.createElement('div');
  Object.assign(actions.style, buttonRow);

  actions.appendChild(
    makeButton('Mark Safe', () => onMarkSafe(senderEmail.split('@')[1] ?? '')),
  );

  // Report logs the first flagged link (query-stripped); P1 stub for the intake call.
  const reportUrl = verdict.reasons.flatMap((r) => r.affectedLinks ?? [])[0] ?? '';
  actions.appendChild(
    makeButton('Report', () => console.log('[CredMail] Report:', reportUrl.split('?')[0])),
  );

  banner.appendChild(actions);

  // Footer.
  const foot = document.createElement('div');
  Object.assign(foot.style, footer);
  foot.textContent = '🔒 Local analysis. No data sent to cloud.';
  banner.appendChild(foot);

  container.insertBefore(banner, container.firstChild);
}
