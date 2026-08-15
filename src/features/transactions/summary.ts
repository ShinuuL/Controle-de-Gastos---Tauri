type Movement = {
  nature: "entrada" | "saida";
  status: "previsto" | "realizado";
  amount_cents: number;
};

export function calculateMonthlyResult(
  movements: readonly Movement[],
): { realized_cents: number; projected_cents: number } {
  return movements.reduce(
    (result, movement) => {
      const signedAmount =
        movement.nature === "entrada"
          ? movement.amount_cents
          : -movement.amount_cents;

      if (movement.status === "realizado") result.realized_cents += signedAmount;
      result.projected_cents += signedAmount;
      return result;
    },
    { realized_cents: 0, projected_cents: 0 },
  );
}
