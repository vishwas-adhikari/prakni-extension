import { RuleResult, ScoringConfig, Verdict } from "./types";

/**
 * Weak signals that come purely from message *content* (not from a URL or the
 * sender). These are common in legitimate transactional mail — a payment
 * reminder is full of urgency and finance language — so a pair of them on their
 * own is NOT corroboration. A corroborating weak pair must include at least one
 * structural (URL/sender-based) weak signal. See docs/detection.md §3.
 */
const CONTENT_WEAK_RULES: ReadonlySet<string> = new Set([
  "urgency",
  "financial",
]);

/**
 * Corroboration over addition (docs/detection.md §3). Deliberately NOT a naive
 * weighted sum — a pile of weak signals must never reach High Risk on its own,
 * and content-only weak signals never corroborate each other.
 *
 *   High Risk  : two or more STRONG signals (and score ≥ highRiskThreshold)
 *   Suspicious : one strong signal, OR a corroborated weak pair — at least
 *                weakCorroborationNeeded weak signals including one structural
 *                signal — with score ≥ suspiciousThreshold
 *   Safe       : everything else
 *
 * The score is the clamped weight sum, used both for display and as the secondary
 * threshold guard. All three thresholds come from the OTA-tunable ScoringConfig.
 */
export function score(results: RuleResult[], config: ScoringConfig): Verdict {
  const strong = results.filter((r) => r.strength === "strong");
  const weak = results.filter((r) => r.strength === "weak");
  const total = Math.min(
    100,
    results.reduce((sum, r) => sum + r.weight, 0),
  );

  const hasStructuralWeak = weak.some(
    (r) => !CONTENT_WEAK_RULES.has(r.ruleName),
  );
  const weakCorroborated =
    weak.length >= config.weakCorroborationNeeded && hasStructuralWeak;

  let riskLevel: Verdict["riskLevel"] = "Safe";
  if (strong.length >= 2 && total >= config.highRiskThreshold) {
    riskLevel = "High Risk";
  } else if (
    (strong.length >= 1 || weakCorroborated) &&
    total >= config.suspiciousThreshold
  ) {
    riskLevel = "Suspicious";
  }

  const silent = riskLevel === "Safe";
  return {
    riskLevel,
    score: total,
    silent,
    reasons: silent ? [] : results,
  };
}
