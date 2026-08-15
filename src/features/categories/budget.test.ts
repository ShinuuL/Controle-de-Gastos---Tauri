import { describe, expect, it } from "vitest";
import { getCategoryBudgetProgress } from "./budget";

describe("getCategoryBudgetProgress", () => {
  it("returns a neutral state when the category has no budget", () => {
    expect(
      getCategoryBudgetProgress({ spent_cents: 2_500, budget_monthly: null }),
    ).toMatchObject({
      status: "no-budget",
      percentage: 0,
      statusLabel: "Sem orçamento definido",
    });
  });

  it("marks spending below 80% of the budget as on track", () => {
    expect(
      getCategoryBudgetProgress({ spent_cents: 7_999, budget_monthly: 10_000 }),
    ).toMatchObject({
      status: "on-track",
      percentage: 79.99,
      statusLabel: "Dentro do orçamento",
    });
  });

  it("marks spending from 80% through 100% as near the budget", () => {
    expect(
      getCategoryBudgetProgress({ spent_cents: 8_000, budget_monthly: 10_000 }),
    ).toMatchObject({
      status: "near-limit",
      percentage: 80,
      statusLabel: "Próximo do limite",
    });
  });

  it("marks spending over the budget as exceeded", () => {
    expect(
      getCategoryBudgetProgress({
        spent_cents: 10_001,
        budget_monthly: 10_000,
      }),
    ).toMatchObject({
      status: "over-budget",
      percentage: 100,
      statusLabel: "Orçamento ultrapassado",
      overBudgetCents: 1,
    });
  });

  it("caps displayed progress at 100%", () => {
    expect(
      getCategoryBudgetProgress({
        spent_cents: 15_000,
        budget_monthly: 10_000,
      }),
    ).toMatchObject({
      percentage: 100,
      actualPercentage: 150,
      overBudgetCents: 5_000,
    });
  });
});
