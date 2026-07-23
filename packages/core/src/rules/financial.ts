// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
import { EmailData, RuleResult } from "../types";

// Weak signal: financial lures. Present in plenty of legitimate mail, so low
// weight — it amplifies a real mismatch but never flags alone.
const WEIGHT = 15;

const FINANCIAL_PATTERNS: RegExp[] = [
  /\bwire transfer\b/i,
  /\bgift cards?\b/i,
  /\b(bitcoin|crypto(currency)?|usdt|ethereum)\b/i,
  // Allows noun-stack variants like "your bank account details" / "your card account number".
  /\b(share|send|update|verify|confirm) your (bank|card|account)(?:\s+\w+){0,2} (details|number|information)\b/i,
  /\bpayment (failed|declined|could not be processed)\b/i,
  /\b(tax|gst) (refund|notice|demand)\b/i,
  /\b(kyc|pan) (update|verification|pending)\b/i,
  /\bclaim your (refund|reward|prize)\b/i,
];

export function financial(data: EmailData): RuleResult | null {
  const text = `${data.subject} ${data.bodyText}`;
  if (!FINANCIAL_PATTERNS.some((re) => re.test(text))) return null;

  return {
    ruleName: "financial",
    weight: WEIGHT,
    strength: "weak",
    description: "Contains a financial trigger commonly used in scams.",
  };
}
