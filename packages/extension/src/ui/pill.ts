// [P1] Inbox-list pill (docs/design.md "Inbox list pill"). Suspicious+ only — Safe
// rows get nothing (the prototype's over-pilling mistake is exactly what we remove).
//
// Same CSP discipline as the banner: createElement + textContent, Object.assign styles.

import { VerdictView, pillBase, pillSuspicious, pillHighRisk } from './styles';

const PILL_ATTR = 'data-credmail-pill';

/**
 * Render (or clear) a risk pill next to `subjectElement`. Idempotent: any prior pill
 * in the same parent is removed first, so re-rendering replaces rather than stacks.
 */
export function injectPill(verdict: VerdictView, subjectElement: HTMLElement): void {
  // Idempotent + silent-clear: remove a prior pill from the subject's parent.
  subjectElement.parentElement
    ?.querySelectorAll(`[${PILL_ATTR}]`)
    .forEach((el) => el.remove());
  if (verdict.silent) return;

  const isHighRisk = verdict.riskLevel === 'High Risk';

  const pill = document.createElement('span');
  pill.setAttribute(PILL_ATTR, '');
  Object.assign(pill.style, pillBase, isHighRisk ? pillHighRisk : pillSuspicious);
  pill.textContent = isHighRisk ? '🚨 High Risk' : '⚠ Suspicious';

  subjectElement.insertAdjacentElement('afterend', pill);
}
