import { BRANDS } from "../data";

/** Brand keywords mentioned in the text, matched on word boundaries. */
export function mentionedBrands(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const brand of Object.keys(BRANDS)) {
    const re = new RegExp(`\\b${escapeRegExp(brand)}\\b`, "i");
    if (re.test(lower)) found.push(brand);
  }
  return found;
}

/** First domain-like token in a string (e.g. "go to paypal.com now" → paypal.com). */
export function domainTokenIn(text: string): string | null {
  const m = text.toLowerCase().match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/);
  return m ? m[1] : null;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
