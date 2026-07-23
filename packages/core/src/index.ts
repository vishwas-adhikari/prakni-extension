// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
import { EmailData, ScoringConfig, Verdict } from "./types";
import { DEFAULT_CONFIG } from "./config";
import { runTrustGate } from "./trust";
import { runRules } from "./rules";
import { score } from "./scorer";

export * from "./types";
export { DEFAULT_CONFIG } from "./config";

/** A cleared sender is Safe and silent — no reasons, no score. */
const SAFE_AND_SILENT: Verdict = {
  riskLevel: "Safe",
  score: 0,
  silent: true,
  reasons: [],
};

/**
 * The detection entry point (docs/detection.md). Pure: takes EmailData, returns
 * a Verdict. No DOM, no chrome, no network.
 *
 * 1. Sender Trust Gate runs first. If it clears the sender, return Safe and the
 *    content rules never run — we never score urgency/finance/brand language on a
 *    trusted sender.
 * 2. Otherwise run the rules and let the corroboration scorer decide.
 */
export function analyzeEmail(
  data: EmailData,
  config: ScoringConfig = DEFAULT_CONFIG,
  whitelist: string[] = [],
): Verdict {
  const trust = runTrustGate(data, whitelist);
  if (trust.trusted) return SAFE_AND_SILENT;

  const results = runRules(data);
  return score(results, config);
}
