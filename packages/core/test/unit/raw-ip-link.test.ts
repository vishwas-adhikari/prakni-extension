import { rawIpLink } from "../../src/rules/raw-ip-link";
import { makeEmail } from "./helpers";

describe("raw-ip-link rule", () => {
  it("fires (strong) when a link host is a raw IPv4 address", () => {
    const r = rawIpLink(
      makeEmail({ links: [{ text: "Verify", url: "http://192.168.1.1/login" }] }),
    );
    expect(r?.strength).toBe("strong");
    expect(r?.affectedLinks).toContain("http://192.168.1.1/login");
  });

  it("does not fire on a named domain", () => {
    expect(
      rawIpLink(
        makeEmail({ links: [{ text: "ok", url: "https://example.com/x" }] }),
      ),
    ).toBeNull();
  });

  it("does not fire when there are no links", () => {
    expect(rawIpLink(makeEmail({ links: [] }))).toBeNull();
  });
});
