import { brandMismatch } from "../../src/rules/brand-mismatch";
import { makeEmail } from "./helpers";

describe("brand-mismatch rule", () => {
  it("does not fire when only the body names a brand the sender domain does not own", () => {
    expect(
      brandMismatch(
        makeEmail({
          senderEmail: "service@paypal-secure-login.com",
          bodyText: "Your PayPal account needs attention.",
        }),
      ),
    ).toBeNull();
  });

  it("fires (strong) when the sender NAME claims a brand the domain does not own", () => {
    const r = brandMismatch(
      makeEmail({
        senderName: "Netflix",
        senderEmail: "billing@netflix-account-update.com",
        bodyText: "Your membership is on hold.",
      }),
    );
    expect(r?.strength).toBe("strong");
  });

  it("fires (strong, weight 45) for a brand in the sender name from a mismatched domain", () => {
    const r = brandMismatch(
      makeEmail({
        senderName: "PayPal Support",
        senderEmail: "support@mail-billing-center.com",
        subject: "Action required",
        bodyText: "Please review your recent activity.",
      }),
    );
    expect(r?.ruleName).toBe("brand-mismatch");
    expect(r?.strength).toBe("strong");
    expect(r?.weight).toBe(45);
    expect(r?.description).toContain("sender name");
  });

  it("fires (weak, weight 15) when only the SUBJECT names a brand the domain does not own", () => {
    const r = brandMismatch(
      makeEmail({
        senderName: "Account Services",
        senderEmail: "noreply@mail-billing-center.com",
        subject: "Your PayPal statement is ready",
        bodyText: "Please review your recent activity.",
      }),
    );
    expect(r?.ruleName).toBe("brand-mismatch");
    expect(r?.strength).toBe("weak");
    expect(r?.weight).toBe(15);
    expect(r?.description).toContain("subject");
  });

  it("does not fire for a body-only brand mention from an unrelated domain (FP guard)", () => {
    expect(
      brandMismatch(
        makeEmail({
          senderName: "Indeed",
          senderEmail: "alerts@indeed.com",
          subject: "New jobs for you",
          bodyText: "New roles at Amazon and Microsoft match your profile.",
        }),
      ),
    ).toBeNull();
  });

  it("fires once (strong, name tier wins) when the brand is in both name and subject", () => {
    const r = brandMismatch(
      makeEmail({
        senderName: "PayPal",
        senderEmail: "support@paypal-secure-login.com",
        subject: "Your PayPal account is limited",
        bodyText: "Verify now.",
      }),
    );
    expect(r?.strength).toBe("strong");
    expect(r?.weight).toBe(45);
    expect(r?.description).toContain("sender name");
  });

  it("does not fire when the sender legitimately owns the brand domain", () => {
    expect(
      brandMismatch(
        makeEmail({
          senderName: "PayPal",
          senderEmail: "service@paypal.com",
          subject: "Your PayPal receipt",
          bodyText: "Your PayPal receipt is attached.",
        }),
      ),
    ).toBeNull();
  });

  it("does not fire for a subdomain of the brand domain", () => {
    expect(
      brandMismatch(
        makeEmail({
          senderName: "PayPal",
          senderEmail: "no-reply@email.paypal.com",
          subject: "Your PayPal receipt",
          bodyText: "Your PayPal receipt is attached.",
        }),
      ),
    ).toBeNull();
  });

  it("does not fire when no brand is mentioned", () => {
    expect(
      brandMismatch(
        makeEmail({
          senderEmail: "hi@tinyvendor.co",
          bodyText: "Here is your invoice for last month.",
        }),
      ),
    ).toBeNull();
  });
});
