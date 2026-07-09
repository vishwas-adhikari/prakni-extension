// [P1] Reading-pane warning banner (docs/design.md "Reading-pane banner").
//
// Shown for Suspicious / High Risk only — Safe stays silent. Every node is built
// with createElement + textContent (never innerHTML: XSS + MV3 CSP) and styled with
// Object.assign (never CSS strings / <style> / classList). Self-contained: it takes
// a local VerdictView and an onMarkSafe callback, and imports nothing from core.

import {
  VerdictView,
  StyleMap,
  bannerBase,
  bannerSuspicious,
  bannerHighRisk,
  iconCircle,
  iconCircleSuspicious,
  iconCircleHighRisk,
  contentGrid,
  bannerHeader,
  headerSuspicious,
  headerHighRisk,
  reasonList,
  reasonItem,
  affectedLink,
  rightColumn,
  buttonBase,
  buttonMarkSafe,
  buttonMarkSafeHover,
  buttonReport,
  buttonReportHover,
  footer,
} from './styles';

const BANNER_ATTR = 'data-credmail-banner';
const PILL_ATTR = 'data-credmail-pill';
const LINK_MAX = 60;

// Containers whose banner is mid Mark-Safe transition. While present, injectBanner
// bails out early so a re-score's silent verdict can't yank the green banner away
// before the fade finishes.
const transitioningBanners = new Set<HTMLElement>();

/** Drop the query string (privacy: CLAUDE.md) and truncate for display. */
function displayUrl(url: string): string {
  const stripped = url.split('?')[0];
  return stripped.length > LINK_MAX ? stripped.slice(0, LINK_MAX) + '…' : stripped;
}

function makeButton(
  label: string,
  variant: StyleMap,
  hover: StyleMap,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  Object.assign(btn.style, buttonBase, variant);
  // CSP forbids :hover rules — repaint via JS listeners instead (skip once disabled).
  btn.addEventListener('mouseenter', () => {
    if (!btn.disabled) Object.assign(btn.style, hover);
  });
  btn.addEventListener('mouseleave', () => {
    if (!btn.disabled) Object.assign(btn.style, variant);
  });
  // Gmail swallows clicks on injected nodes — stop the event reaching its handlers.
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    onClick();
  });
  return btn;
}

/**
 * Mark-Safe transition: morph the warning banner into a green confirmation, hand the
 * full sender address up to the adapter (which decides domain vs. contact), then fade
 * the banner + reading-pane pill out. The container is "owned" for the duration so a
 * re-score can't disturb the animation (see the guard in injectBanner).
 */
function markSafe(
  banner: HTMLElement,
  container: HTMLElement,
  senderEmail: string,
  onMarkSafe: (senderEmail: string) => void,
): void {
  transitioningBanners.add(container);

  // Repaint green and strip the warning content. Collapse the two-column flex
  // layout to a simple block so the confirmation text reads left-to-right.
  Object.assign(banner.style, {
    display: 'block',
    background: '#F0FDF4',
    borderLeft: '5px solid #16A34A',
    color: '#166534',
    padding: '16px 20px',
  });
  banner.textContent = '';

  const header = document.createElement('div');
  Object.assign(header.style, bannerHeader);
  header.textContent = '✅ Marked Safe';
  banner.appendChild(header);

  const note = document.createElement('div');
  note.textContent = 'This sender has been added to your trusted list.';
  banner.appendChild(note);

  // Dumb UI: pass the full address up; the adapter routes domain vs. contact.
  onMarkSafe(senderEmail);

  setTimeout(() => {
    Object.assign(banner.style, { transition: 'opacity 0.8s ease', opacity: '0' });
  }, 2000);

  setTimeout(() => {
    banner.remove();
    document.querySelectorAll(`[${PILL_ATTR}]`).forEach((el) => el.remove());
    transitioningBanners.delete(container);
  }, 2800);
}

/**
 * Render (or clear) the banner at the top of `container`. Idempotent: any existing
 * banner is removed first, so re-rendering replaces rather than stacks.
 */
export function injectBanner(
  verdict: VerdictView,
  container: HTMLElement,
  senderEmail: string,
  onMarkSafe: (senderEmail: string) => void,
  onReport: (senderEmail: string) => void,
): void {
  // A Mark-Safe transition owns this container until its fade completes — don't let
  // a re-score's (silent) verdict clear the green banner out from under it.
  if (transitioningBanners.has(container)) return;
  // Idempotent + silent-clear: always remove a prior banner first.
  container.querySelectorAll(`[${BANNER_ATTR}]`).forEach((el) => el.remove());
  if (verdict.silent) return;

  const isHighRisk = verdict.riskLevel === 'High Risk';

  const banner = document.createElement('div');
  banner.setAttribute(BANNER_ATTR, '');
  Object.assign(banner.style, bannerBase, isHighRisk ? bannerHighRisk : bannerSuspicious);

  // Left column: large circular icon.
  const icon = document.createElement('div');
  Object.assign(icon.style, iconCircle, isHighRisk ? iconCircleHighRisk : iconCircleSuspicious);
  icon.textContent = isHighRisk ? '🚨' : '⚠️';
  banner.appendChild(icon);

  // Right column: grid of header (full width) + reasons (left) + actions (right).
  const content = document.createElement('div');
  Object.assign(content.style, contentGrid);

  // Header: small icon + title with score.
  const header = document.createElement('div');
  Object.assign(header.style, bannerHeader, isHighRisk ? headerHighRisk : headerSuspicious);
  header.textContent = `${isHighRisk ? '🚨' : '⚠️'} Potential Phishing Indicators Found (${verdict.score}/100)`;
  content.appendChild(header);

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
  content.appendChild(list);

  // Actions + footer, stacked in the right-hand column.
  const actions = document.createElement('div');
  Object.assign(actions.style, rightColumn);

  actions.appendChild(
    makeButton('✓ Mark Safe', buttonMarkSafe, buttonMarkSafeHover, () =>
      markSafe(banner, container, senderEmail, onMarkSafe),
    ),
  );

  // Report logs the first flagged link (query-stripped); P1 stub for the intake call.
  // No flagged links (e.g. content-only warning) → fall back to the sender address.
  const reportUrl = verdict.reasons.flatMap((r) => r.affectedLinks ?? [])[0] || senderEmail;
  const reportBtn = makeButton('🚩 Report', buttonReport, buttonReportHover, () => {
    console.log('[CredMail] Report:', reportUrl.split('?')[0]);
    onReport(senderEmail);
    reportBtn.disabled = true;
    reportBtn.textContent = '✓ Reported';
    Object.assign(reportBtn.style, {
      background: '#E5E7EB',
      borderColor: '#E5E7EB',
      color: '#757575',
      cursor: 'default',
    });
  });
  actions.appendChild(reportBtn);

  // Footer.
  const foot = document.createElement('div');
  Object.assign(foot.style, footer);
  foot.textContent = '🔒 Local analysis. No data sent to cloud.';
  actions.appendChild(foot);

  content.appendChild(actions);
  banner.appendChild(content);

  container.insertBefore(banner, container.firstChild);
}
