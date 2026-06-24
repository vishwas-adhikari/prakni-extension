import { financial } from "../../src/rules/financial";
import { makeEmail } from "./helpers";

describe("financial rule", () => {
  it("fires (weak) on a financial lure", () => {
    const r = financial(
      makeEmail({
        bodyText: "Please share your bank account details to claim your refund.",
      }),
    );
    expect(r?.strength).toBe("weak");
    expect(r?.ruleName).toBe("financial");
  });

  it("does not fire on an ordinary payment confirmation", () => {
    expect(
      financial(
        makeEmail({ bodyText: "Your payment of Rs. 2,499 was successful." }),
      ),
    ).toBeNull();
  });
});
