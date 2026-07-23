// Copyright (c) 2026 KanthiraLabs. All rights reserved. Proprietary and confidential.
import { EmailData, RuleResult } from "../types";
import { hostFromUrl, isRawIp } from "../util/domain";

// Strong signal: a link whose host is a raw IPv4 address (e.g.
// http://192.168.1.1/login). Legitimate senders use domain names, not bare IPs.
const WEIGHT = 45;

export function rawIpLink(data: EmailData): RuleResult | null {
  const affected: string[] = [];

  for (const link of data.links) {
    const host = hostFromUrl(link.url);
    if (host && isRawIp(host)) affected.push(link.url);
  }

  if (affected.length === 0) return null;

  return {
    ruleName: "raw-ip-link",
    weight: WEIGHT,
    strength: "strong",
    description: "Links to a raw IP address instead of a named domain.",
    affectedLinks: [...new Set(affected)],
  };
}
