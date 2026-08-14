import { registrableDomain, isTrustedLinkHost } from "../../src/util/domain";

describe("registrableDomain", () => {
  it("plain TLDs → last two labels", () => {
    expect(registrableDomain("mail.paypal.com")).toBe("paypal.com");
    expect(registrableDomain("paypal.com")).toBe("paypal.com");
    expect(registrableDomain("a.b.c.example.com")).toBe("example.com");
  });

  it("India multi-part ccTLDs → last three labels", () => {
    expect(registrableDomain("sbi.co.in")).toBe("sbi.co.in");
    expect(registrableDomain("hdfcbank.co.in")).toBe("hdfcbank.co.in");
    expect(registrableDomain("mail.sbi.co.in")).toBe("sbi.co.in");
    // Bare two-label suffix: returned as-is by the ≤2 guard. Not a real
    // registrable domain anyway, so nothing downstream depends on it.
    expect(registrableDomain("gov.in")).toBe("gov.in");
    expect(registrableDomain("co.in")).toBe("co.in");
    expect(registrableDomain("nic.gov.in")).toBe("nic.gov.in");
  });

  it("other multi-part ccTLDs", () => {
    expect(registrableDomain("bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomain("news.bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomain("shop.com.au")).toBe("shop.com.au");
    expect(registrableDomain("www.shop.com.au")).toBe("shop.com.au");
    expect(registrableDomain("mail.example.co.jp")).toBe("example.co.jp");
  });

  it("a two-label suffix that is NOT multi-part still collapses to two labels", () => {
    // .co.us is not in the curated set — no special casing.
    expect(registrableDomain("shop.co.us")).toBe("co.us");
  });

  it("edge cases", () => {
    expect(registrableDomain("localhost")).toBe("localhost");
    expect(registrableDomain("")).toBe("");
  });
});

describe("isTrustedLinkHost — keys on the corrected domain", () => {
  it("resolves multi-part-ccTLD hosts to their three-label domain", () => {
    // The bug: these used to key on "co.in", so every *.co.in host shared one
    // lookup key. Now each resolves to its own registrable domain.
    expect(registrableDomain("phishy-sbi.co.in")).toBe("phishy-sbi.co.in");
    expect(registrableDomain("sbi.co.in")).not.toBe(
      registrableDomain("attacker.co.in"),
    );
  });

  it("an untrusted .co.in host is not trusted by suffix alone", () => {
    expect(isTrustedLinkHost("definitely-not-a-bank.co.in")).toBe(false);
  });
});
