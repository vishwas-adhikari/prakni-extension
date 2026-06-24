import { urgency } from "../../src/rules/urgency";
import { makeEmail } from "./helpers";

describe("urgency rule", () => {
  it("fires (weak) on pressure language", () => {
    const r = urgency(
      makeEmail({
        bodyText: "Your account will be suspended within 24 hours. Act now.",
      }),
    );
    expect(r?.strength).toBe("weak");
    expect(r?.ruleName).toBe("urgency");
  });

  it("does not fire on calm transactional text", () => {
    expect(
      urgency(
        makeEmail({ bodyText: "Your statement for May 2026 is now available." }),
      ),
    ).toBeNull();
  });
});
