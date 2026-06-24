import { EmailData, RuleResult } from "../types";
import {
  hostFromUrl,
  isTrustedLinkHost,
  registrableDomain,
} from "../util/domain";

// Weak signal: high Shannon entropy in a link's base domain suggests an
// algorithmically generated (DGA-style) domain. Entropy is measured on the base
// domain label only (TLD stripped), so a noisy TLD doesn't skew it.
//
// Conservative by design: per-character Shannon entropy is bounded by
// log2(length), so SHORT gibberish bases (e.g. "x7kj2m") stay under this
// threshold and are caught primarily by the other structural rules
// (deceptive-url-keywords, raw-ip-link, url-shortener) via corroboration — not
// by this rule. This rule targets longer, high-variety random domains.
const WEIGHT = 15;
const ENTROPY_THRESHOLD = 3.5;

/** The base domain label, with the TLD stripped (paypal.com → "paypal"). */
function baseDomain(host: string): string {
  const labels = registrableDomain(host).split(".");
  return labels.length > 1 ? labels.slice(0, -1).join(".") : labels.join(".");
}

/** Per-character Shannon entropy (bits) of a string. */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export function urlEntropy(data: EmailData): RuleResult | null {
  const affected: string[] = [];

  for (const link of data.links) {
    const host = hostFromUrl(link.url);
    if (!host || isTrustedLinkHost(host)) continue;
    if (shannonEntropy(baseDomain(host)) > ENTROPY_THRESHOLD) {
      affected.push(link.url);
    }
  }

  if (affected.length === 0) return null;

  return {
    ruleName: "url-entropy",
    weight: WEIGHT,
    strength: "weak",
    description: "Links to a domain that looks randomly generated.",
    affectedLinks: [...new Set(affected)],
  };
}
