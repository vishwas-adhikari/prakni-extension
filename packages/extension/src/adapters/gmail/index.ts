// [P1] Gmail content script entry. Observe → extract → score → render, on-device.
//
// State pass-through (trap B): the core engine is pure and cannot read
// chrome.storage.local, so we fetch LocalState FIRST and pass the OTA thresholds
// and the user whitelist into analyzeEmail. Without this the engine can't see a
// "Mark Safe" sender or the tuned thresholds.

import { analyzeEmail, type Verdict } from '@credmail/core';
import { getState, getDomSelectors, addToWhitelist } from '../../storage/local-state';
import { startObserver } from './observer';
import { extract } from './parser';
import { injectBanner } from '../../ui/banner';
import { injectPill } from '../../ui/pill';

// Scored verdicts by message id. The engine never re-runs for a message we've
// already judged — reopening an email is a cache hit, not a rescan. We keep the
// sender alongside the verdict so the cache-hit path can re-render the banner
// WITHOUT re-extracting; everything else (emailData, container) is re-derived live.
const verdictCache = new Map<string, { verdict: Verdict; senderEmail: string }>();

/** The reading-pane subject element (OTA subject selectors), for the pill. */
async function findSubjectElement(): Promise<HTMLElement | null> {
  const selectors = await getDomSelectors();
  for (const sel of selectors.subject ?? []) {
    try {
      const el = document.querySelector(sel);
      if (el) return el as HTMLElement;
    } catch {
      /* invalid OTA selector — ignore */
    }
  }
  return null;
}

/** Paint (or, when Safe/silent, clear) the banner and pill for a verdict. */
async function render(
  verdict: Verdict,
  container: Element,
  senderEmail: string,
  onMarkSafe: (domain: string) => void,
): Promise<void> {
  // Core's Verdict is structurally the UI's VerdictView; container is an Element
  // here but the banner only uses ParentNode ops.
  injectBanner(verdict, container as HTMLElement, senderEmail, onMarkSafe);
  const subjectEl = await findSubjectElement();
  if (subjectEl) injectPill(verdict, subjectEl);
}

startObserver(async (messageId, container) => {
  // Mark Safe: whitelist the sender's domain, then re-extract from the LIVE DOM and
  // re-score (never a cached emailData — we don't store one) so the new verdict is
  // accurate. A failed extraction is logged and skipped, never thrown.
  const onMarkSafe = async (domain: string): Promise<void> => {
    if (domain) await addToWhitelist(domain);
    const fresh = await extract(container, messageId);
    if (!fresh) {
      console.warn(
        `[CredMail] Mark Safe re-score skipped: extraction returned null for ${messageId}`,
      );
      return;
    }
    const state = await getState();
    const verdict = analyzeEmail(fresh, state.scoring_config, state.local_whitelist);
    verdictCache.set(messageId, { verdict, senderEmail: fresh.senderEmail });
    await render(verdict, container, fresh.senderEmail, onMarkSafe);
  };

  const cached = verdictCache.get(messageId);
  if (cached) {
    console.log(
      `[CredMail] cache hit for ${messageId}: ${cached.verdict.riskLevel} (${cached.verdict.score})`,
    );
    await render(cached.verdict, container, cached.senderEmail, onMarkSafe);
    return;
  }

  const state = await getState(); // CRITICAL: state before scoring (trap B)
  if (!state.is_active) return;

  const emailData = await extract(container, messageId);
  if (!emailData) return; // low confidence — parser already fired telemetry

  const verdict = analyzeEmail(emailData, state.scoring_config, state.local_whitelist);
  verdictCache.set(messageId, { verdict, senderEmail: emailData.senderEmail });
  console.log(
    `[CredMail] Verdict for ${messageId}: ${verdict.riskLevel} (${verdict.score})`,
  );
  await render(verdict, container, emailData.senderEmail, onMarkSafe);
});

console.log('[CredMail] gmail content script loaded');
