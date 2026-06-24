import { EmailData, RuleResult } from "../types";
import { hostFromUrl, isTrustedLinkHost } from "../util/domain";

// Weak signal: security/account keywords in the URL path of a non-trusted host
// (e.g. http://random.xyz/secure/login). Legitimate brands use these paths too,
// so it only counts on an unverified destination and only when corroborated.
const WEIGHT = 15;

const KEYWORDS = [
  "login",
  "signin",
  "verify",
  "secure",
  "account",
  "password",
  "confirm",
  "update",
];

function pathOf(url: string): string {
  try {
    const u = new URL(url.trim());
    return (u.pathname + u.search).toLowerCase();
  } catch {
    return "";
  }
}

export function deceptiveUrlKeywords(data: EmailData): RuleResult | null {
  const affected: string[] = [];

  for (const link of data.links) {
    const host = hostFromUrl(link.url);
    if (!host || isTrustedLinkHost(host)) continue;
    const path = pathOf(link.url);
    if (KEYWORDS.some((kw) => path.includes(kw))) affected.push(link.url);
  }

  if (affected.length === 0) return null;

  return {
    ruleName: "deceptive-url-keywords",
    weight: WEIGHT,
    strength: "weak",
    description:
      "A link uses security or account keywords in its path on an unverified domain.",
    affectedLinks: [...new Set(affected)],
  };
}
