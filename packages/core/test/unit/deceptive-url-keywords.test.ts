import { deceptiveUrlKeywords } from "../../src/rules/deceptive-url-keywords";
import { makeEmail } from "./helpers";

describe("deceptive-url-keywords rule", () => {
  it("fires (weak) on security keywords in the path of an untrusted host", () => {
    const r = deceptiveUrlKeywords(
      makeEmail({
        links: [{ text: "Sign in", url: "http://random-portal.xyz/secure/login" }],
      }),
    );
    expect(r?.strength).toBe("weak");
    expect(r?.ruleName).toBe("deceptive-url-keywords");
  });

  it("does not fire when the keyword path is on a trusted host", () => {
    expect(
      deceptiveUrlKeywords(
        makeEmail({
          links: [{ text: "x", url: "https://github.com/login" }],
        }),
      ),
    ).toBeNull();
  });

  it("does not fire when the path has no keywords", () => {
    expect(
      deceptiveUrlKeywords(
        makeEmail({
          links: [{ text: "x", url: "http://random-portal.xyz/news/article" }],
        }),
      ),
    ).toBeNull();
  });
});
