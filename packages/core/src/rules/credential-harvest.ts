// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
import { EmailData, RuleResult } from "../types";
import { TRUSTED_DOMAINS } from "../data";
import { hostFromUrl, registrableDomain } from "../util/domain";

// "Medium"-tier signal (docs/detection.md). RuleResult.strength is binary, so this
// maps to `weak` with an elevated weight: it can corroborate but never flag alone.
const WEIGHT = 25;

const CREDENTIAL_PATTERNS: RegExp[] = [
  /verify your (account|identity|email|details)/i,
  /confirm your (account|identity|password|details)/i,
  /update your (password|account|billing|payment)/i,
  /(sign|log) ?in to (your|verify)/i,
  /(unlock|re-?activate|restore) your account/i,
  /your account (has been|will be) (suspended|locked|disabled|deactivated)/i,
];

function pointsToUntrusted(data: EmailData): boolean {
  return data.links.some((link) => {
    const host = hostFromUrl(link.url);
    if (!host) return false;
    return !TRUSTED_DOMAINS.has(registrableDomain(host));
  });
}

export function credentialHarvest(data: EmailData): RuleResult | null {
  const text = `${data.subject} ${data.bodyText}`;
  const matched = CREDENTIAL_PATTERNS.some((re) => re.test(text));
  if (!matched) return null;

  // Credential wording is only meaningful when it drives the user to an
  // unverified destination — that combination is the harvesting shape.
  if (!pointsToUntrusted(data)) return null;

  return {
    ruleName: "credential-harvest",
    weight: WEIGHT,
    strength: "weak",
    description:
      "Asks you to verify or sign in and links to a page on an unverified domain.",
  };
}
