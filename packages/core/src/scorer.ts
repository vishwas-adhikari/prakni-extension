// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
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
 * `rawScore` is the clamped weight sum and is what the threshold gates above run
 * on. `score` is the banded *display* value derived from the risk level afterwards,
 * so the number shown can never contradict the label. All three thresholds come from
 * the OTA-tunable ScoringConfig.
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

  // ---- Derived display score (banded to match riskLevel) --------------------
  // Detection above is unchanged. This only shapes the NUMBER shown to the user so it
  // can never contradict the label (no "100/100 but Suspicious"). Both bands use flat
  // per-signal contributions with a weak-count cap, which keeps scores monotonic
  // (an extra STRONG signal always outranks added weak ones) and non-saturating as the
  // rule set grows toward ~20 rules. See docs/detection.md and SCALING.md.
  const clamp = (n: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, n));

  // Cap the weak contribution so many weak signals can never overtake a strong one.
  const cappedWeak = Math.min(weak.length, 4);

  let displayScore = 0;
  if (riskLevel === "Suspicious") {
    // Band 30–69. One strong signal outranks a weak pair (45-style lead preserved):
    //   +15 for a lone strong signal, +4 per weak signal (capped at 4).
    const singleStrongBonus = strong.length === 1 ? 15 : 0;
    displayScore = clamp(30 + singleStrongBonus + 4 * cappedWeak, 30, 69);
  } else if (riskLevel === "High Risk") {
    // Band 70–100. +15 per strong signal beyond the required two, +3 per weak (capped).
    // Weak is capped at 4 so 2-strong-plus-many-weak can never exceed 3-strong (monotonic).
    const extraStrong = 15 * Math.max(0, strong.length - 2);
    displayScore = clamp(70 + extraStrong + 3 * cappedWeak, 70, 100);
  }
  // Safe → displayScore stays 0.

  return {
    riskLevel,
    score: displayScore,
    rawScore: total,
    silent,
    reasons: silent ? [] : results,
  };
}
