// Pure domain/URL helpers. No DOM, no network — just string parsing.
import { ESP_DOMAINS, TRUSTED_DOMAINS } from "../data";

/** Lowercased host from an email address, or "" if unparseable. */
export function domainFromEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at === -1) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

/** Lowercased host from a URL, or "" if unparseable. */
export function hostFromUrl(url: string): string {
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Registrable domain — the last two labels (e.g. mail.paypal.com → paypal.com).
 * A deliberately simple heuristic; a full public-suffix list is a later-phase
 * enhancement. Good enough for exact-match trust and brand comparison at P0.
 */
export function registrableDomain(host: string): string {
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return host;
  return labels.slice(-2).join(".");
}

/** True if `host` is exactly `domain` or a subdomain of it. */
export function isSameOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

/** True if the host is a bare IPv4 literal (e.g. 192.0.2.10). */
export function isRawIp(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** True if the host contains non-ASCII characters or a punycode label. */
export function hasNonAsciiOrPunycode(host: string): boolean {
  if (/[^\x00-\x7f]/.test(host)) return true;
  return host.split(".").some((label) => label.startsWith("xn--"));
}

/**
 * A link host the URL-based rules should not treat as suspicious: either a
 * curated trusted domain or a known ESP that legitimately hosts tracking links.
 */
export function isTrustedLinkHost(host: string): boolean {
  if (!host) return false;
  const domain = registrableDomain(host);
  return TRUSTED_DOMAINS.has(domain) || ESP_DOMAINS.has(domain);
}
