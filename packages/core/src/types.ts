// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// Core TypeScript types — see docs/schema.md.
// The core engine only ever sees these; it never touches the DOM.

/** Produced by an adapter, consumed by the core engine. */
export interface EmailData {
  id: string; // message/thread id (de-dupes scans)
  senderName: string;
  senderEmail: string;
  subject: string;
  bodyText: string;
  links: { text: string; url: string }[];
  auth: {
    // strongest precision input
    spf: "pass" | "fail" | "unknown";
    dkim: "pass" | "fail" | "unknown";
    dmarc: "pass" | "fail" | "unknown";
    aligned: boolean | null; // authenticated domain matches From domain
  };
}

export interface TrustResult {
  trusted: boolean;
  reason:
    | "authenticated"
    | "reputation"
    | "trusted_list"
    | "user_whitelist"
    | "not_trusted";
}

export interface RuleResult {
  ruleName: string;
  weight: number;
  strength: "weak" | "strong";
  description: string; // plain-language reason shown in the banner
  affectedLinks?: string[];
}

export interface MlResult {
  // [P2]
  probability: number; // 0..1
  reasons: string[]; // e.g. ["High URL entropy", "Raw IP address"]
}

export interface Verdict {
  riskLevel: "Safe" | "Suspicious" | "High Risk";
  score: number; // 0–100 for display
  silent: boolean; // true when Safe → render nothing
  reasons: RuleResult[]; // populated only for Suspicious / High Risk
  ml?: MlResult;
}

export interface ScoringConfig {
  // OTA-tunable; never hardcode thresholds
  suspiciousThreshold: number;
  highRiskThreshold: number;
  weakCorroborationNeeded: number;
}

export interface LocalState {
  // chrome.storage.local
  user_tier: "free" | "pro" | "business_lite" | "enterprise";
  auth_token: string | null; // signed tier token [P2]
  is_active: boolean;
  local_whitelist: string[];
  safe_contacts: string[]; // full email addresses marked safe on freemail domains
  local_blocklist: string[];
  dom_selectors: Record<string, unknown>; // cached OTA (string[] for engine selectors, an object for row selectors)
  scoring_config: ScoringConfig; // cached OTA
  session_stats: { scanned: number; detected: number; markedSafe: number }; // this-session counters
}
