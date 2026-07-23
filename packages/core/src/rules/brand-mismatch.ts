// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
import { EmailData, RuleResult } from "../types";
import { BRANDS } from "../data";
import { mentionedBrands } from "../util/text";
import {
  domainFromEmail,
  isSameOrSubdomain,
  registrableDomain,
} from "../util/domain";

// Strong signal: the sender name / subject / body names a brand, but the From
// domain is generic or unrelated to that brand's canonical domain (docs/detection.md).
const WEIGHT = 45;

export function brandMismatch(data: EmailData): RuleResult | null {
  const senderDomain = registrableDomain(domainFromEmail(data.senderEmail));
  if (!senderDomain) return null;

  const brands = mentionedBrands(
    `${data.senderName} ${data.subject} ${data.bodyText}`,
  );
  const mismatched: string[] = [];

  for (const brand of brands) {
    const canonical = BRANDS[brand];
    // Sender legitimately belongs to the brand → not a mismatch.
    if (isSameOrSubdomain(senderDomain, canonical)) continue;
    mismatched.push(brand);
  }

  if (mismatched.length === 0) return null;

  const names = [...new Set(mismatched.map((b) => BRANDS[b]))].join(", ");
  return {
    ruleName: "brand-mismatch",
    weight: WEIGHT,
    strength: "strong",
    description: `Mentions ${names} but was sent from ${senderDomain}, which is not that brand's domain.`,
  };
}
