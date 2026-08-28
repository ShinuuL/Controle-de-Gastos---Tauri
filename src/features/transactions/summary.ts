import type { MovementNature, MovementStatus } from "../../lib/types";

type Movement = {
  nature: MovementNature;
  status: MovementStatus;
  amount_cents: number;
};

export interface MonthlyResult {
  /** Resultado liquido das movimentacoes ja efetivadas. */
  realized_cents: number;
  /** Resultado liquido incluindo as previstas. */
  projected_cents: number;
  /** Soma das entradas ja efetivadas no mes. Previstas ficam de fora. Sempre >= 0. */
  income_cents: number;
}

export function calculateMonthlyResult(
  movements: readonly Movement[],
): MonthlyResult {
  return movements.reduce<MonthlyResult>(
    (result, movement) => {
      const signedAmount =
        movement.nature === "entrada"
          ? movement.amount_cents
          : -movement.amount_cents;

      if (movement.status === "realizado") result.realized_cents += signedAmount;
      result.projected_cents += signedAmount;
      // So entra no totalizador o dinheiro que de fato caiu: uma entrada
       // prevista e uma promessa, e somar promessa a caixa infla o mes.
      if (movement.nature === "entrada" && movement.status === "realizado") {
        result.income_cents += movement.amount_cents;
      }
      return result;
    },
    { realized_cents: 0, projected_cents: 0, income_cents: 0 },
  );
}
