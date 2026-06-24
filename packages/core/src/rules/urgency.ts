import { EmailData, RuleResult } from "../types";

// Weak signal: pressure/urgency language. Common in legitimate transactional mail
// too, so it carries low weight and can never trip a warning on its own.
const WEIGHT = 15;

const URGENCY_PATTERNS: RegExp[] = [
  /\bact (now|immediately|fast)\b/i,
  /\b(within|in) \d+ ?(hours?|minutes?|hrs?)\b/i,
  /\bimmediate(ly)? (action|attention) (required|needed)\b/i,
  /\b(account|access) (will be|has been) (suspended|blocked|locked|deactivated)\b/i,
  /\b(urgent|final notice|last warning)\b/i,
  /\bbefore it'?s too late\b/i,
  /\bverify (now|immediately)\b/i,
];

export function urgency(data: EmailData): RuleResult | null {
  const text = `${data.subject} ${data.bodyText}`;
  if (!URGENCY_PATTERNS.some((re) => re.test(text))) return null;

  return {
    ruleName: "urgency",
    weight: WEIGHT,
    strength: "weak",
    description: "Uses urgency or pressure language to prompt a fast reaction.",
  };
}
