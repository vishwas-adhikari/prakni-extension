import { linkMismatch } from "../../src/rules/link-mismatch";
import { makeEmail } from "./helpers";

describe("link-mismatch rule", () => {
  it("fires when the visible text host differs from the href host", () => {
    const r = linkMismatch(
      makeEmail({
        links: [
          {
            text: "https://www.paypal.com/verify",
            url: "http://paypal-secure-login.com/verify",
          },
        ],
      }),
    );
    expect(r?.strength).toBe("strong");
  });

  it("does NOT fire when the href host is a known ESP (legitimate click tracking)", () => {
    const r = linkMismatch(
      makeEmail({
        links: [
          {
            text: "https://www.flipkart.com/deals",
            url: "https://u1234.ct.sendgrid.net/ss/c/abcd/deals",
          },
        ],
      }),
    );
    expect(r).toBeNull();
  });

  it("does not fire when text and destination agree", () => {
    expect(
      linkMismatch(
        makeEmail({
          links: [
            { text: "https://amazon.in/orders", url: "https://www.amazon.in/orders" },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("does not fire for non-URL anchor text", () => {
    expect(
      linkMismatch(
        makeEmail({
          links: [{ text: "View your order", url: "https://shop.example.com/o/1" }],
        }),
      ),
    ).toBeNull();
  });
});
