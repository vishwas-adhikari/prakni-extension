import { EmailData } from "../types";
import { domainFromEmail } from "../util/domain";

/**
 * User-marked-safe senders (LocalState.local_whitelist, from chrome.storage.local
 * in the extension). Matches either the exact sender address or its domain.
 *
 * The whitelist is the user's explicit override, so it clears regardless of auth.
 */
export function onUserWhitelist(data: EmailData, whitelist: string[]): boolean {
  if (!whitelist || whitelist.length === 0) return false;
  const email = data.senderEmail.trim().toLowerCase();
  const domain = domainFromEmail(data.senderEmail);
  return whitelist.some((entry) => {
    const e = entry.trim().toLowerCase();
    return e === email || e === domain;
  });
}
