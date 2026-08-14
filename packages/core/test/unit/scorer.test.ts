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

// A weak signal with a non-default weight (e.g. credential-harvest carries 25).
const weakOfWeight = (name: string, weight: number): RuleResult => ({
  ruleName: name,
  weight,
  strength: "weak",
  description: name,
});

const nStrong = (n: number) =>
  Array.from({ length: n }, (_, i) => strong(`strong-${i}`));
const nStructuralWeak = (n: number) =>
  Array.from({ length: n }, (_, i) => structuralWeak(`weak-${i}`));

/** The FedEx-shaped case: brand-mismatch + credential-harvest + deceptive-url + urgency. */
const fedexShaped = (): RuleResult[] => [
  strong("brand-mismatch"),
  weakOfWeight("credential-harvest", 25),
  structuralWeak("deceptive-url-keywords"),
  contentWeak("urgency"),
];

describe("scorer — banded display score", () => {
  // Representative inputs spanning every band, reused by the invariant sweeps.
  const cases: { name: string; results: RuleResult[] }[] = [
    { name: "no signals", results: [] },
    { name: "lone weak", results: [contentWeak("urgency")] },
    { name: "content-only weak pair", results: [contentWeak("urgency"), contentWeak("financial")] },
    { name: "brand alone", results: [strong("brand-mismatch")] },
    {
      name: "structural weak pair",
      results: [structuralWeak("deceptive-url-keywords"), contentWeak("urgency")],
    },
    { name: "fedex-shaped", results: fedexShaped() },
    { name: "2 strong", results: nStrong(2) },
    { name: "2 strong + 3 weak", results: [...nStrong(2), ...nStructuralWeak(3)] },
    { name: "2 strong + 6 weak", results: [...nStrong(2), ...nStructuralWeak(6)] },
    { name: "3 strong", results: nStrong(3) },
    { name: "5 strong + 4 weak", results: [...nStrong(5), ...nStructuralWeak(4)] },
  ];

  it.each(cases)("$name — score never contradicts riskLevel", ({ results }) => {
    const v = score(results, DEFAULT_CONFIG);
    if (v.riskLevel === "Safe") {
      expect(v.score).toBe(0);
    } else if (v.riskLevel === "Suspicious") {
      expect(v.score).toBeGreaterThanOrEqual(30);
      expect(v.score).toBeLessThanOrEqual(69);
    } else {
      expect(v.score).toBeGreaterThanOrEqual(70);
      expect(v.score).toBeLessThanOrEqual(100);
    }
  });

  it("rawScore is the clamped weight sum, independent of banding", () => {
    // 45 + 25 + 15 + 15 = 100
    expect(score(fedexShaped(), DEFAULT_CONFIG).rawScore).toBe(100);
    expect(score([strong("brand-mismatch")], DEFAULT_CONFIG).rawScore).toBe(45);
    expect(score(nStrong(2), DEFAULT_CONFIG).rawScore).toBe(90);
    // clamped at 100 rather than 135
    expect(score(nStrong(3), DEFAULT_CONFIG).rawScore).toBe(100);
  });

  // The guarantee the High-Risk weak cap exists to provide: piling on weak signals
  // can never outrank an additional STRONG signal. Fails without cappedWeak.
  it("an extra strong signal outranks any number of weak ones", () => {
    const threeStrong = score(nStrong(3), DEFAULT_CONFIG);
    const twoStrongSixWeak = score(
      [...nStrong(2), ...nStructuralWeak(6)],
      DEFAULT_CONFIG,
    );
    expect(threeStrong.riskLevel).toBe("High Risk");
    expect(twoStrongSixWeak.riskLevel).toBe("High Risk");
    expect(threeStrong.score).toBeGreaterThan(twoStrongSixWeak.score);
    expect(threeStrong.score).toBe(85);
    expect(twoStrongSixWeak.score).toBe(82);
  });

  it("a lone strong signal outranks a corroborated weak pair", () => {
    const brand = score([strong("brand-mismatch")], DEFAULT_CONFIG);
    const weakPair = score(
      [structuralWeak("deceptive-url-keywords"), contentWeak("urgency")],
      DEFAULT_CONFIG,
    );
    expect(brand.score).toBeGreaterThan(weakPair.score);
  });

  it("fedex-shaped → Suspicious at 57 (not 100)", () => {
    const v = score(fedexShaped(), DEFAULT_CONFIG);
    expect(v.riskLevel).toBe("Suspicious");
    expect(v.score).toBe(57);
    expect(v.rawScore).toBe(100);
  });

  it("brand-mismatch alone → Suspicious at 45", () => {
    const v = score([strong("brand-mismatch")], DEFAULT_CONFIG);
    expect(v.riskLevel).toBe("Suspicious");
    expect(v.score).toBe(45);
  });

  it("structural weak pair → Suspicious at 38", () => {
    const v = score(
      [structuralWeak("deceptive-url-keywords"), contentWeak("urgency")],
      DEFAULT_CONFIG,
    );
    expect(v.riskLevel).toBe("Suspicious");
    expect(v.score).toBe(38);
  });

  it("two strong signals → High Risk at the band floor (70)", () => {
    const v = score(nStrong(2), DEFAULT_CONFIG);
    expect(v.riskLevel).toBe("High Risk");
    expect(v.score).toBe(70);
  });

  it("2 strong + 3 weak → High Risk at 79", () => {
    const v = score([...nStrong(2), ...nStructuralWeak(3)], DEFAULT_CONFIG);
    expect(v.riskLevel).toBe("High Risk");
    expect(v.score).toBe(79);
  });

  it("5 strong + 4 weak → High Risk clamped at 100", () => {
    const v = score([...nStrong(5), ...nStructuralWeak(4)], DEFAULT_CONFIG);
    expect(v.riskLevel).toBe("High Risk");
    expect(v.score).toBe(100);
  });

  it("Safe verdicts score 0 even with weight on the board", () => {
    const v = score([contentWeak("urgency"), contentWeak("financial")], DEFAULT_CONFIG);
    expect(v.riskLevel).toBe("Safe");
    expect(v.score).toBe(0);
    expect(v.rawScore).toBe(30); // raw weight is still reported
  });
});
