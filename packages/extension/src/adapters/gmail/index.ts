// [P1] Gmail content script entry. Observe → extract → score, all on-device.
//
// State pass-through (trap B): the core engine is pure and cannot read
// chrome.storage.local, so we fetch LocalState FIRST and pass the OTA thresholds
// and the user whitelist into analyzeEmail. Without this the engine can't see a
// "Mark Safe" sender or the tuned thresholds.
// (analyzeEmail's 3rd arg is the whitelist string[]; the blocklist has no core
//  consumer until the Report/Mark-Safe loop in P1.5 — TODO then.)

import { analyzeEmail, type Verdict } from '@credmail/core';
import { getState } from '../../storage/local-state';
import { startObserver } from './observer';
import { extract } from './parser';

// Scored verdicts by message id. The engine never re-runs for a message we've
// already judged — reopening an email is a cache hit, not a rescan.
const verdictCache = new Map<string, Verdict>();

startObserver(async (messageId, container) => {
  const cached = verdictCache.get(messageId);
  if (cached) {
    console.log(
      `[CredMail] cache hit for ${messageId}: ${cached.riskLevel} (${cached.score})`,
    );
    return;
  }

  const state = await getState(); // CRITICAL: state before scoring (trap B)
  if (!state.is_active) return;

  const emailData = await extract(container, messageId);
  if (!emailData) return; // low confidence — parser already fired telemetry

  const verdict = analyzeEmail(emailData, state.scoring_config, state.local_whitelist);
  verdictCache.set(messageId, verdict);
  console.log(
    `[CredMail] Verdict for ${messageId}: ${verdict.riskLevel} (${verdict.score})`,
  );
});

console.log('[CredMail] gmail content script loaded');
