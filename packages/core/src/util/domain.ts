// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
// Pure domain/URL helpers. No DOM, no network — just string parsing.
import { ESP_DOMAINS, TRUSTED_DOMAINS } from "../data";

/**
 * Two-label public suffixes under which registrations happen at the THIRD level
 * (e.g. sbi.co.in, not co.in). Not exhaustive — a curated set covering the India
 * beachhead plus common global ccTLDs. A full public-suffix list is a later-phase
 * enhancement; this fixes the cases that matter for trust/brand matching today.
 */
const MULTI_PART_SUFFIXES: ReadonlySet<string> = new Set([
  // India (beachhead)
  "co.in", "net.in", "org.in", "gen.in", "firm.in", "ind.in",
  "gov.in", "nic.in", "ac.in", "edu.in", "res.in", "mil.in",
  // United Kingdom
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk",
  "ac.uk", "gov.uk", "nhs.uk",
  // Australia / NZ
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "id.au",
  "co.nz", "net.nz", "org.nz", "govt.nz", "ac.nz",
  // Other common
  "com.br", "com.cn", "com.hk", "com.sg", "com.mx", "co.jp", "co.za", "co.kr",
]);

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
 * Registrable domain — normally the last two labels (mail.paypal.com → paypal.com),
 * but three labels under a known multi-part public suffix (sbi.co.in → sbi.co.in,
 * NOT co.in). See MULTI_PART_SUFFIXES.
 */
export function registrableDomain(host: string): string {
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) {
    return labels.slice(-3).join(".");
  }
  return lastTwo;
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
