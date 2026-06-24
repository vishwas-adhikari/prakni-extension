import { brandMismatch } from "../../src/rules/brand-mismatch";
import { makeEmail } from "./helpers";

describe("brand-mismatch rule", () => {
  it("fires (strong) when the body names a brand the sender domain does not own", () => {
    const r = brandMismatch(
      makeEmail({
        senderEmail: "service@paypal-secure-login.com",
        bodyText: "Your PayPal account needs attention.",
      }),
    );
    expect(r?.strength).toBe("strong");
    expect(r?.ruleName).toBe("brand-mismatch");
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

  it("does not fire when the sender legitimately owns the brand domain", () => {
    expect(
      brandMismatch(
        makeEmail({
          senderEmail: "service@paypal.com",
          bodyText: "Your PayPal receipt is attached.",
        }),
      ),
    ).toBeNull();
  });

  it("does not fire for a subdomain of the brand domain", () => {
    expect(
      brandMismatch(
        makeEmail({
          senderEmail: "no-reply@email.paypal.com",
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
