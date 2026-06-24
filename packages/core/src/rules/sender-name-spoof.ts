import { EmailData, RuleResult } from "../types";
import { BRANDS, FREE_EMAIL_PROVIDERS } from "../data";
import { domainFromEmail, registrableDomain } from "../util/domain";
import { mentionedBrands } from "../util/text";

// Strong signal: the display name claims a brand, but the address is a free
// webmail account (e.g. "ICICI Bank" <scammer@gmail.com>). A real brand never
// sends from a personal free-provider mailbox.
const WEIGHT = 45;

export function senderNameSpoof(data: EmailData): RuleResult | null {
  const senderDomain = registrableDomain(domainFromEmail(data.senderEmail));
  if (!FREE_EMAIL_PROVIDERS.has(senderDomain)) return null;

  const brands = mentionedBrands(data.senderName);
  // A free-provider sender legitimately owning the brand domain is impossible
  // here (the domain is gmail.com etc.), so any brand in the name is a spoof.
  if (brands.length === 0) return null;

  const names = [...new Set(brands.map((b) => BRANDS[b]))].join(", ");
  return {
    ruleName: "sender-name-spoof",
    weight: WEIGHT,
    strength: "strong",
    description: `The sender name claims to be ${names} but the email comes from a personal ${senderDomain} account.`,
  };
}
