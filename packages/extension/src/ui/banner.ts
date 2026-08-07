// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
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
  bannerIcon,
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

/**
 * Read-only: is a Mark-Safe green transition currently running in this container?
 * Adapters that remove their banner via their own wrapper (Outlook) must check this
 * before removing, so a re-render can't destroy the green banner mid-fade. Gmail's
 * path already respects the same guard inside injectBanner.
 */
export function isBannerTransitioning(container: HTMLElement): boolean {
  return transitioningBanners.has(container);
}

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

  // Repaint into a spacious green confirmation, keeping the flex row so the green
  // "safe" shield sits beside the confirmation text. Reuse the existing icon <img>,
  // swapped to w3c.png (stay an image — never fall back to an emoji).
  const icon = banner.querySelector('img');
  Object.assign(banner.style, {
    background: '#F0FDF4',
    border: '1px solid #BBF7D0',
    borderLeft: '5px solid #16A34A',
    borderRadius: '12px',
    color: '#166534',
    padding: '24px 28px',
    minHeight: '100px',
  });
  banner.textContent = '';
  if (icon) {
    icon.src = chrome.runtime.getURL('icons/w3c.png');
    Object.assign(icon.style, { width: '80px', height: '80px' });
    banner.appendChild(icon);
  }

  // Content column: subtle green-tinted separator, matching the warning layout.
  const content = document.createElement('div');
  Object.assign(content.style, {
    flex: '1',
    minWidth: '0',
    borderLeft: '1px solid rgba(0,0,0,0.06)',
    paddingLeft: '20px',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    fontSize: '20px',
    fontWeight: '700',
    color: '#166534',
    marginBottom: '8px',
  });
  header.textContent = '✅ Marked Safe';
  content.appendChild(header);

  const note = document.createElement('div');
  Object.assign(note.style, {
    fontSize: '15px',
    color: '#374151',
    lineHeight: '1.5',
  });
  note.textContent = 'This sender has been added to your trusted list.';
  content.appendChild(note);

  // Footer: product logo + local-analysis assurance, bottom-right.
  const foot = document.createElement('div');
  Object.assign(foot.style, {
    marginTop: '12px',
    textAlign: 'right',
    fontSize: '12px',
    color: '#66BB6A',
  });
  const footLogo = document.createElement('img');
  footLogo.src = chrome.runtime.getURL('icons/credmail-final-removebg.png');
  Object.assign(footLogo.style, {
    width: '16px',
    height: '16px',
    objectFit: 'contain',
    verticalAlign: 'middle',
    marginRight: '6px',
  });
  foot.appendChild(footLogo);
  foot.appendChild(document.createTextNode('🔒 Local analysis. No data sent to cloud.'));
  content.appendChild(foot);

  banner.appendChild(content);

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
  // Optional gate consulted BEFORE the green Mark-Safe transition starts. It receives a
  // `proceed` continuation and calls it only if the action should go ahead — so the
  // banner never turns green on an action the user then cancels. Stays a plain function
  // reference: the blocklist lookup lives in the adapters, never in this file.
  guardMarkSafe?: (senderEmail: string, proceed: () => void) => void,
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

  // Left column: large circular icon image (the PNG has the circle baked in).
  const icon = document.createElement('img');
  icon.src = chrome.runtime.getURL(isHighRisk ? 'icons/w2c.png' : 'icons/w1c.png');
  Object.assign(icon.style, bannerIcon);
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
    makeButton('✓ Mark Safe', buttonMarkSafe, buttonMarkSafeHover, () => {
      const proceed = (): void => markSafe(banner, container, senderEmail, onMarkSafe);
      if (guardMarkSafe) {
        guardMarkSafe(senderEmail, proceed);
      } else {
        proceed();
      }
    }),
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

  // Footer: product logo + local-analysis assurance.
  const foot = document.createElement('div');
  Object.assign(foot.style, footer);
  const logo = document.createElement('img');
  logo.src = chrome.runtime.getURL('icons/credmail-final-removebg.png');
  Object.assign(logo.style, {
    width: '16px',
    height: '16px',
    objectFit: 'contain',
    verticalAlign: 'middle',
    marginRight: '6px',
  });
  foot.appendChild(logo);
  foot.appendChild(document.createTextNode('🔒 Local analysis. No data sent to cloud.'));
  actions.appendChild(foot);

  content.appendChild(actions);
  banner.appendChild(content);

  container.insertBefore(banner, container.firstChild);
}
