import { ScoringConfig } from "./types";

// Default scoring thresholds. These are OTA-tunable at runtime (docs/detection.md);
// this object is only the built-in fallback when no OTA config has been delivered.
//
// The scorer requires structural corroboration AND a score above the relevant
// threshold (see scorer.ts) — it is deliberately not a naive weighted sum.
export const DEFAULT_CONFIG: ScoringConfig = {
  suspiciousThreshold: 30,
  highRiskThreshold: 70,
  weakCorroborationNeeded: 2,
};
