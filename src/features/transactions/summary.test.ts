import { describe, expect, it } from "vitest";
import { calculateMonthlyResult } from "./summary";

describe("calculateMonthlyResult", () => {
  it("separates the realized result from the monthly projection", () => {
    expect(
      calculateMonthlyResult([
        { nature: "entrada", status: "realizado", amount_cents: 10_000 },
        { nature: "saida", status: "realizado", amount_cents: 3_000 },
        { nature: "entrada", status: "previsto", amount_cents: 2_000 },
        { nature: "saida", status: "previsto", amount_cents: 500 },
      ]),
    ).toEqual({ realized_cents: 7_000, projected_cents: 8_500 });
  });
});
