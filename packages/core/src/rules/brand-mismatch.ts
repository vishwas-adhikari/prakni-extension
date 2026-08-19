// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
import { EmailData, RuleResult } from "../types";
import { BRANDS } from "../data";
import { mentionedBrands } from "../util/text";
import {
  domainFromEmail,
  isSameOrSubdomain,
  registrableDomain,
} from "../util/domain";

// Location-aware: *where* a brand is named decides how much it means
// (docs/detection.md). A brand in the sender NAME is impersonation — the From
// header claims to be the brand. A brand in the SUBJECT is only an amplifier.
// A brand named in the BODY alone is mere prose and is not flagged at all.
const NAME_WEIGHT = 45;
const SUBJECT_WEIGHT = 15;

export function brandMismatch(data: EmailData): RuleResult | null {
  const senderDomain = registrableDomain(domainFromEmail(data.senderEmail));
  if (!senderDomain) return null;

  const notOwned = (brand: string): boolean =>
    !isSameOrSubdomain(senderDomain, BRANDS[brand]);

  // Sender-name impersonation → strong.
  const nameBrands = mentionedBrands(data.senderName).filter(notOwned);
  if (nameBrands.length > 0) {
    const names = [...new Set(nameBrands.map((b) => BRANDS[b]))].join(", ");
    return {
      ruleName: "brand-mismatch",
      weight: NAME_WEIGHT,
      strength: "strong",
      description: `The sender name mentions ${names} but the email was sent from ${senderDomain}, which is not that brand's domain.`,
    };
  }

  // Subject brand (not already claimed in the name) → weak amplifier.
  const subjectBrands = mentionedBrands(data.subject).filter(
    (b) => notOwned(b) && !nameBrands.includes(b),
  );
  if (subjectBrands.length > 0) {
    const names = [...new Set(subjectBrands.map((b) => BRANDS[b]))].join(", ");
    return {
      ruleName: "brand-mismatch",
      weight: SUBJECT_WEIGHT,
      strength: "weak",
      description: `The subject mentions ${names} but the email was sent from ${senderDomain}, which is not that brand's domain.`,
    };
  }

  // Body-only brand mentions are intentionally NOT flagged — a brand named in prose
  // is not impersonation, and was the dominant false-positive source. The verbatim
  // brand-in-domain class (e.g. paypal-secure-login.com) is deferred to a dedicated
  // future rule; realistic phish of that shape carry links caught by the URL rules.
  return null;
}
