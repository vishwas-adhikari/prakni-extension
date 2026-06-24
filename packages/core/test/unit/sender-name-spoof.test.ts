import { senderNameSpoof } from "../../src/rules/sender-name-spoof";
import { makeEmail } from "./helpers";

describe("sender-name-spoof rule", () => {
  it("fires (strong) when a brand name is sent from a free webmail account", () => {
    const r = senderNameSpoof(
      makeEmail({
        senderName: "ICICI Bank",
        senderEmail: "icicibank.alerts99@gmail.com",
      }),
    );
    expect(r?.strength).toBe("strong");
    expect(r?.ruleName).toBe("sender-name-spoof");
  });

  it("fires for other free providers (yahoo, hotmail)", () => {
    expect(
      senderNameSpoof(
        makeEmail({ senderName: "PayPal Support", senderEmail: "x@yahoo.com" }),
      ),
    ).not.toBeNull();
  });

  it("does not fire when the sender is not a free provider", () => {
    expect(
      senderNameSpoof(
        makeEmail({ senderName: "PayPal", senderEmail: "service@paypal.com" }),
      ),
    ).toBeNull();
  });

  it("does not fire when the display name names no brand", () => {
    expect(
      senderNameSpoof(
        makeEmail({ senderName: "Priya Sharma", senderEmail: "priya@gmail.com" }),
      ),
    ).toBeNull();
  });
});
