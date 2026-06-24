import { EmailData } from "../../src/types";

/** Build an EmailData with sensible defaults; override only what a test cares about. */
export function makeEmail(overrides: Partial<EmailData> = {}): EmailData {
  return {
    id: "test-1",
    senderName: "Test Sender",
    senderEmail: "someone@example.com",
    subject: "Hello",
    bodyText: "Just a normal message.",
    links: [],
    auth: { spf: "unknown", dkim: "unknown", dmarc: "unknown", aligned: null },
    ...overrides,
  };
}
