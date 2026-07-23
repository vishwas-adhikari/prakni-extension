// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
import { EmailData, RuleResult } from "../types";
import { SHORTENER_DOMAINS } from "../data";
import { hostFromUrl, registrableDomain } from "../util/domain";

// Weak signal: a URL-shortener link hides the real destination. Common in
// legitimate mail too, so it only matters when corroborated.
const WEIGHT = 15;

export function urlShortener(data: EmailData): RuleResult | null {
  const affected: string[] = [];

  for (const link of data.links) {
    const host = hostFromUrl(link.url);
    if (host && SHORTENER_DOMAINS.has(registrableDomain(host))) {
      affected.push(link.url);
    }
  }

  if (affected.length === 0) return null;

  return {
    ruleName: "url-shortener",
    weight: WEIGHT,
    strength: "weak",
    description: "Uses a URL shortener that hides the real destination.",
    affectedLinks: [...new Set(affected)],
  };
}
