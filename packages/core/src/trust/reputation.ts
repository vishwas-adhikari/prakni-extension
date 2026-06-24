import { EmailData } from "../types";
import { TRUSTED_DOMAINS } from "../data";
import { domainFromEmail, registrableDomain } from "../util/domain";
import { authFailed } from "./auth";

/**
 * Curated trusted-list lookup. Exact registrable-domain membership against the
 * curated set (docs/detection.md "Curated trusted list").
 *
 * Precision guard: a list hit does NOT clear the sender when authentication has
 * explicitly FAILED. A failing-auth message claiming a trusted domain is the
 * canonical spoof case and must fall through to the rules. Unknown auth (the DOM
 * often cannot read headers) still clears — erring toward silence on safe mail.
 *
 * Note: the Bloom-filter "reputation" signal is a P1+ enhancement; at P0 this is
 * the curated list only, so the reason reported by the gate is `trusted_list`.
 */
export function onTrustedList(data: EmailData): boolean {
  if (authFailed(data)) return false;
  const domain = registrableDomain(domainFromEmail(data.senderEmail));
  if (!domain) return false;
  return TRUSTED_DOMAINS.has(domain);
}
