// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
import { EmailData, RuleResult } from "../types";
import { brandMismatch } from "./brand-mismatch";
import { homoglyph } from "./homoglyph";
import { linkMismatch } from "./link-mismatch";
import { rawIpLink } from "./raw-ip-link";
import { senderNameSpoof } from "./sender-name-spoof";
import { credentialHarvest } from "./credential-harvest";
import { urlShortener } from "./url-shortener";
import { urlEntropy } from "./url-entropy";
import { deceptiveUrlKeywords } from "./deceptive-url-keywords";
import { urgency } from "./urgency";
import { financial } from "./financial";

type Rule = (data: EmailData) => RuleResult | null;

const RULES: Rule[] = [
  // strong
  brandMismatch,
  homoglyph,
  linkMismatch,
  rawIpLink,
  senderNameSpoof,
  // weak (structural)
  credentialHarvest,
  urlShortener,
  urlEntropy,
  deceptiveUrlKeywords,
  // weak (content)
  urgency,
  financial,
];

/** Run every content rule and return the signals that fired. */
export function runRules(data: EmailData): RuleResult[] {
  const results: RuleResult[] = [];
  for (const rule of RULES) {
    const result = rule(data);
    if (result) results.push(result);
  }
  return results;
}
