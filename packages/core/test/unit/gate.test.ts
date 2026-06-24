import { runTrustGate } from "../../src/trust";
import { analyzeEmail } from "../../src/index";
import { makeEmail } from "./helpers";

describe("Sender Trust Gate", () => {
  it("clears an authenticated, aligned sender", () => {
    const r = runTrustGate(
      makeEmail({
        senderEmail: "x@randomstartup.io",
        auth: { spf: "pass", dkim: "pass", dmarc: "pass", aligned: true },
      }),
    );
    expect(r).toEqual({ trusted: true, reason: "authenticated" });
  });

  it("clears a curated trusted-list domain when auth is unknown", () => {
    const r = runTrustGate(
      makeEmail({ senderEmail: "alerts@hdfcbank.com" }),
    );
    expect(r).toEqual({ trusted: true, reason: "trusted_list" });
  });

  it("clears a subdomain of a trusted-list domain", () => {
    const r = runTrustGate(
      makeEmail({ senderEmail: "no-reply@accounts.google.com" }),
    );
    expect(r.trusted).toBe(true);
  });

  it("does NOT clear a trusted-list domain when auth explicitly failed (spoof case)", () => {
    const r = runTrustGate(
      makeEmail({
        senderEmail: "service@paypal.com",
        auth: { spf: "fail", dkim: "fail", dmarc: "fail", aligned: false },
      }),
    );
    expect(r).toEqual({ trusted: false, reason: "not_trusted" });
  });

  it("honours the user whitelist regardless of auth", () => {
    const r = runTrustGate(
      makeEmail({
        senderEmail: "friend@unknown-domain.xyz",
        auth: { spf: "fail", dkim: "fail", dmarc: "fail", aligned: false },
      }),
      ["unknown-domain.xyz"],
    );
    expect(r).toEqual({ trusted: true, reason: "user_whitelist" });
  });

  it("does not clear an unknown small sender, but rules may still find it Safe", () => {
    const email = makeEmail({ senderEmail: "hi@tinyvendor.co" });
    expect(runTrustGate(email).trusted).toBe(false);
    // No content signals → still Safe overall.
    expect(analyzeEmail(email).riskLevel).toBe("Safe");
  });

  it("a cleared sender is never scored on content (Safe + silent)", () => {
    const v = analyzeEmail(
      makeEmail({
        senderEmail: "alerts@hdfcbank.com",
        subject: "URGENT: verify your account now",
        bodyText:
          "Your account will be suspended within 24 hours. Confirm your account details immediately.",
        links: [{ text: "verify", url: "http://192.0.2.1/login" }],
      }),
    );
    expect(v.riskLevel).toBe("Safe");
    expect(v.silent).toBe(true);
    expect(v.reasons).toHaveLength(0);
  });
});
