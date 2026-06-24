import { score } from "../../src/scorer";
import { DEFAULT_CONFIG } from "../../src/config";
import { RuleResult } from "../../src/types";

const strong = (name: string): RuleResult => ({
  ruleName: name,
  weight: 45,
  strength: "strong",
  description: name,
});
const weak = (name: string): RuleResult => ({
  ruleName: name,
  weight: 15,
  strength: "weak",
  description: name,
});
// urgency / financial are content-only weak signals; everything else is structural.
const contentWeak = (name: "urgency" | "financial") => weak(name);
const structuralWeak = (name: string) => weak(name);

describe("scorer — corroboration over addition", () => {
  it("no signals → Safe and silent", () => {
    const v = score([], DEFAULT_CONFIG);
    expect(v.riskLevel).toBe("Safe");
    expect(v.silent).toBe(true);
    expect(v.reasons).toHaveLength(0);
  });

  it("a lone weak signal stays Safe", () => {
    expect(score([weak("urgency")], DEFAULT_CONFIG).riskLevel).toBe("Safe");
  });

  it("one strong signal → Suspicious", () => {
    expect(score([strong("brand-mismatch")], DEFAULT_CONFIG).riskLevel).toBe(
      "Suspicious",
    );
  });

  it("a content-only weak pair (urgency + financial) stays Safe", () => {
    expect(
      score(
        [contentWeak("urgency"), contentWeak("financial")],
        DEFAULT_CONFIG,
      ).riskLevel,
    ).toBe("Safe");
  });

  it("a weak pair with a structural signal → Suspicious", () => {
    expect(
      score(
        [structuralWeak("deceptive-url-keywords"), contentWeak("urgency")],
        DEFAULT_CONFIG,
      ).riskLevel,
    ).toBe("Suspicious");
  });

  it("two structural weak signals → Suspicious", () => {
    expect(
      score(
        [structuralWeak("url-shortener"), structuralWeak("deceptive-url-keywords")],
        DEFAULT_CONFIG,
      ).riskLevel,
    ).toBe("Suspicious");
  });

  it("two strong signals → High Risk", () => {
    expect(
      score(
        [strong("brand-mismatch"), strong("homoglyph")],
        DEFAULT_CONFIG,
      ).riskLevel,
    ).toBe("High Risk");
  });

  it("populates reasons only when not Safe", () => {
    const v = score([strong("brand-mismatch")], DEFAULT_CONFIG);
    expect(v.silent).toBe(false);
    expect(v.reasons.length).toBeGreaterThan(0);
  });
});
