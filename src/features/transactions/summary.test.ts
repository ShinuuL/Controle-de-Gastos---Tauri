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
    ).toEqual({
      realized_cents: 7_000,
      projected_cents: 8_500,
      income_cents: 10_000,
    });
  });

  it("soma so as entradas ja efetivadas, ignorando as previstas", () => {
    const r = calculateMonthlyResult([
      { nature: "entrada", status: "realizado", amount_cents: 500_000 },
      { nature: "entrada", status: "previsto", amount_cents: 20_000 },
      { nature: "saida", status: "realizado", amount_cents: 120_000 },
    ]);
    expect(r.income_cents).toBe(500_000);
  });

  it("mes so com entrada prevista mantem o totalizador zerado", () => {
    const r = calculateMonthlyResult([
      { nature: "entrada", status: "previsto", amount_cents: 20_000 },
    ]);
    expect(r).toEqual({
      realized_cents: 0,
      projected_cents: 20_000,
      income_cents: 0,
    });
  });

  it("nao conta saidas como entrada", () => {
    const r = calculateMonthlyResult([
      { nature: "saida", status: "realizado", amount_cents: 90_000 },
    ]);
    expect(r.income_cents).toBe(0);
  });

  it("mes vazio zera os tres totais", () => {
    expect(calculateMonthlyResult([])).toEqual({
      realized_cents: 0,
      projected_cents: 0,
      income_cents: 0,
    });
  });
});
