// Single place that reaches across the package boundary into /data.
// Keeping the relative path here means the rest of core imports plain symbols.
import trustedDomains from "../../../data/trusted-domains.json";
import brands from "../../../data/brands.json";
import shorteners from "../../../data/url-shorteners.json";
import espDomains from "../../../data/esp-domains.json";
import freeProviders from "../../../data/free-email-providers.json";

const lowerSet = (arr: string[]): ReadonlySet<string> =>
  new Set(arr.map((d) => d.toLowerCase()));

/** Curated trusted-sender domains (exact registrable-domain match). */
export const TRUSTED_DOMAINS = lowerSet(trustedDomains as string[]);

/** brand keyword → canonical domain (e.g. "paypal" → "paypal.com"). */
export const BRANDS: Readonly<Record<string, string>> = brands as Record<
  string,
  string
>;

/** Known URL-shortener domains. */
export const SHORTENER_DOMAINS = lowerSet(shorteners as string[]);

/**
 * Email service providers that legitimately host click-tracking links. A link
 * pointing at one of these is normal in legitimate marketing/transactional mail,
 * so the URL-based rules treat ESP hosts as non-suspicious.
 */
export const ESP_DOMAINS = lowerSet(espDomains as string[]);

/** Free webmail providers (used to spot brand display-name spoofs). */
export const FREE_EMAIL_PROVIDERS = lowerSet(freeProviders as string[]);
