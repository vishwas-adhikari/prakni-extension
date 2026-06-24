import { EmailData, TrustResult } from "../types";
import { passesAuth } from "./auth";
import { onTrustedList } from "./reputation";
import { onUserWhitelist } from "./whitelist";

/**
 * Sender Trust Gate (docs/detection.md §1). Runs FIRST, before any content rule.
 * If any check clears the sender the email is Safe and the rules do not run.
 *
 * Order reflects intent, not just strength: the user's explicit whitelist wins,
 * then cryptographic authentication, then the curated trusted list.
 *
 * A failed gate does NOT mean phishing — plenty of legitimate small senders fail
 * it and should still come out Safe once the rules find nothing.
 */
export function runTrustGate(
  data: EmailData,
  whitelist: string[] = [],
): TrustResult {
  if (onUserWhitelist(data, whitelist)) {
    return { trusted: true, reason: "user_whitelist" };
  }
  if (passesAuth(data)) {
    return { trusted: true, reason: "authenticated" };
  }
  if (onTrustedList(data)) {
    return { trusted: true, reason: "trusted_list" };
  }
  return { trusted: false, reason: "not_trusted" };
}
