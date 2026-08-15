export type CategoryBudgetStatus =
  "no-budget" | "on-track" | "near-limit" | "over-budget";

export interface CategoryBudgetValues {
  spent_cents: number;
  budget_monthly: number | null;
}

export interface CategoryBudgetProgressDisplay {
  status: CategoryBudgetStatus;
  percentage: number;
  actualPercentage: number;
  overBudgetCents: number;
  statusLabel: string;
  statusDescription: string;
}

export function getCategoryBudgetProgress({
  spent_cents,
  budget_monthly,
}: CategoryBudgetValues): CategoryBudgetProgressDisplay {
  if (budget_monthly === null || budget_monthly <= 0) {
    return {
      status: "no-budget",
      percentage: 0,
      actualPercentage: 0,
      overBudgetCents: 0,
      statusLabel: "Sem orçamento definido",
      statusDescription: "Esta categoria não possui um orçamento mensal.",
    };
  }

  const actualPercentage = Number(
    ((spent_cents / budget_monthly) * 100).toFixed(2),
  );
  const percentage = Math.min(actualPercentage, 100);
  if (actualPercentage > 100) {
    return {
      status: "over-budget",
      percentage,
      actualPercentage,
      overBudgetCents: spent_cents - budget_monthly,
      statusLabel: "Orçamento ultrapassado",
      statusDescription: "Os gastos ultrapassaram o orçamento mensal.",
    };
  }
  if (actualPercentage >= 80) {
    return {
      status: "near-limit",
      percentage,
      actualPercentage,
      overBudgetCents: 0,
      statusLabel: "Próximo do limite",
      statusDescription: "Os gastos já alcançaram 80% do orçamento mensal.",
    };
  }
  return {
    status: "on-track",
    percentage,
    actualPercentage,
    overBudgetCents: 0,
    statusLabel: "Dentro do orçamento",
    statusDescription: "Os gastos estão dentro do orçamento mensal.",
  };
}
