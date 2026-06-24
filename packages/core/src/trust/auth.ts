import { EmailData } from "../types";

/**
 * Email authentication — the strongest trust signal (docs/detection.md).
 *
 * Clears a sender only when the authenticated domain is aligned with the From
 * domain AND authentication actually passed. This is what stops a spoofer who
 * simply types `amazon.com` in the From field: reputation alone cannot.
 */
export function passesAuth(data: EmailData): boolean {
  const { spf, dkim, dmarc, aligned } = data.auth;
  if (aligned !== true) return false;
  // DMARC pass implies an aligned, authenticated domain. Absent DMARC, require
  // both SPF and DKIM to pass.
  if (dmarc === "pass") return true;
  return spf === "pass" && dkim === "pass";
}

/** True if any auth mechanism explicitly failed (vs. merely unknown). */
export function authFailed(data: EmailData): boolean {
  const { spf, dkim, dmarc } = data.auth;
  return spf === "fail" || dkim === "fail" || dmarc === "fail";
}
