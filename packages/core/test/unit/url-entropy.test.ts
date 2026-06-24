import { urlEntropy, shannonEntropy } from "../../src/rules/url-entropy";
import { makeEmail } from "./helpers";

describe("shannonEntropy", () => {
  it("is 0 for a single repeated character", () => {
    expect(shannonEntropy("aaaa")).toBe(0);
  });

  it("rises with character variety", () => {
    expect(shannonEntropy("abcdefgh")).toBeGreaterThan(shannonEntropy("aabbcc"));
  });
});

describe("url-entropy rule", () => {
  it("fires (weak) on a long high-entropy host", () => {
    const r = urlEntropy(
      makeEmail({
        links: [{ text: "go", url: "http://xq7zp2mk9wv4rb8ns3dh.com/a" }],
      }),
    );
    expect(r?.strength).toBe("weak");
  });

  it("does not fire on a normal host", () => {
    expect(
      urlEntropy(
        makeEmail({ links: [{ text: "x", url: "https://newsletter.example.com" }] }),
      ),
    ).toBeNull();
  });

  it("does not fire on a trusted/ESP host even if oddly named", () => {
    expect(
      urlEntropy(
        makeEmail({ links: [{ text: "x", url: "https://u123.ct.sendgrid.net/abc" }] }),
      ),
    ).toBeNull();
  });
});
