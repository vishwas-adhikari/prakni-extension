import { EmailData, RuleResult } from "../types";
import { domainTokenIn } from "../util/text";
import { hostFromUrl, registrableDomain } from "../util/domain";
import { ESP_DOMAINS } from "../data";

// Strong signal: the visible link text claims one destination but the href points
// to a different host (docs/detection.md). Raw-IP destinations are handled by the
// dedicated raw-ip-link rule, so this rule is purely about text-vs-destination.
const WEIGHT = 45;

export function linkMismatch(data: EmailData): RuleResult | null {
  const affected: string[] = [];
  const descriptions: string[] = [];

  for (const link of data.links) {
    const host = hostFromUrl(link.url);
    if (!host) continue;

    // ESP awareness: email service providers legitimately rewrite links to their
    // own tracking domains, so a text/host mismatch there is expected, not a lure.
    if (ESP_DOMAINS.has(registrableDomain(host))) continue;

    // Visible text names a domain that disagrees with where the link actually goes.
    const textDomain = domainTokenIn(link.text);
    if (textDomain) {
      const shown = registrableDomain(textDomain);
      const actual = registrableDomain(host);
      if (shown !== actual) {
        affected.push(link.url);
        descriptions.push(`link text shows ${shown} but goes to ${actual}`);
      }
    }
  }

  if (affected.length === 0) return null;

  return {
    ruleName: "link-mismatch",
    weight: WEIGHT,
    strength: "strong",
    description: `Link destination does not match what is shown: ${[
      ...new Set(descriptions),
    ].join("; ")}.`,
    affectedLinks: [...new Set(affected)],
  };
}
