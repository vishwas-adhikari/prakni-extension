import { EmailData, RuleResult } from "../types";
import { BRANDS } from "../data";
import {
  domainFromEmail,
  hasNonAsciiOrPunycode,
  hostFromUrl,
} from "../util/domain";

// Strong signal: a lookalike host — punycode / non-ASCII script, or a
// digit-for-letter substitution that imitates a known brand (paypa1, micros0ft).
const WEIGHT = 45;

// Only consider reasonably long brand names for substitution matching, so short
// tokens can't produce incidental matches.
const MIN_BRAND_LEN = 5;
const BRAND_TOKENS = Object.keys(BRANDS).filter((b) => b.length >= MIN_BRAND_LEN);

const LEET: Record<string, string> = {
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  $: "s",
  "@": "a",
};

// Multi-character visual confusables that leet substitution alone can't catch
// (e.g. "arnazon" → "amazon", "vvhatsapp" → "whatsapp").
const CONFUSABLES: [RegExp, string][] = [
  [/rn/g, "m"],
  [/vv/g, "w"],
];

function deleet(label: string): string {
  let s = label;
  for (const [re, to] of CONFUSABLES) s = s.replace(re, to);
  return s.replace(/[013457$@]/g, (c) => LEET[c] ?? c);
}

/** Does this host imitate a brand via punycode/non-ASCII or a leet substitution? */
function looksLikeLookalike(host: string): boolean {
  if (!host) return false;
  if (hasNonAsciiOrPunycode(host)) return true;

  for (const label of host.split(".")) {
    const normalized = deleet(label);
    if (normalized === label) continue; // no substitution → handled elsewhere
    for (const brand of BRAND_TOKENS) {
      // The brand only appears after de-leeting → an intentional lookalike.
      if (normalized.includes(brand) && !label.includes(brand)) return true;
    }
  }
  return false;
}

export function homoglyph(data: EmailData): RuleResult | null {
  const affected: string[] = [];

  const senderHost = domainFromEmail(data.senderEmail);
  if (looksLikeLookalike(senderHost)) affected.push(senderHost);

  for (const link of data.links) {
    const host = hostFromUrl(link.url);
    if (looksLikeLookalike(host)) affected.push(link.url);
  }

  if (affected.length === 0) return null;

  return {
    ruleName: "homoglyph",
    weight: WEIGHT,
    strength: "strong",
    description:
      "Contains a lookalike address that imitates a trusted brand using altered or non-standard characters.",
    affectedLinks: [...new Set(affected)],
  };
}
