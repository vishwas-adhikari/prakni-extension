import { homoglyph } from "../../src/rules/homoglyph";
import { makeEmail } from "./helpers";

describe("homoglyph rule", () => {
  it("flags a digit-substitution lookalike sender (paypa1.com)", () => {
    const r = homoglyph(makeEmail({ senderEmail: "security@paypa1.com" }));
    expect(r?.strength).toBe("strong");
    expect(r?.affectedLinks).toContain("paypa1.com");
  });

  it("flags a digit-substitution lookalike link (micros0ft)", () => {
    const r = homoglyph(
      makeEmail({
        links: [{ text: "verify", url: "http://micros0ft-support.com/x" }],
      }),
    );
    expect(r?.strength).toBe("strong");
  });

  it("flags a punycode link host", () => {
    const r = homoglyph(
      makeEmail({
        links: [{ text: "click", url: "https://xn--pypal-4ve.com/login" }],
      }),
    );
    expect(r?.strength).toBe("strong");
  });

  it("does not fire on a genuine brand domain", () => {
    expect(
      homoglyph(
        makeEmail({
          senderEmail: "x@microsoft.com",
          links: [{ text: "ok", url: "https://www.microsoft.com" }],
        }),
      ),
    ).toBeNull();
  });
});
