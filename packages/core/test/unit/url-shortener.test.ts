import { urlShortener } from "../../src/rules/url-shortener";
import { makeEmail } from "./helpers";

describe("url-shortener rule", () => {
  it("fires (weak) on a known shortener", () => {
    const r = urlShortener(
      makeEmail({ links: [{ text: "Claim", url: "https://bit.ly/abc123" }] }),
    );
    expect(r?.strength).toBe("weak");
    expect(r?.ruleName).toBe("url-shortener");
  });

  it("fires on other shorteners too", () => {
    expect(
      urlShortener(
        makeEmail({ links: [{ text: "x", url: "https://tinyurl.com/xyz" }] }),
      ),
    ).not.toBeNull();
  });

  it("does not fire on a normal domain", () => {
    expect(
      urlShortener(
        makeEmail({ links: [{ text: "x", url: "https://example.com/page" }] }),
      ),
    ).toBeNull();
  });
});
