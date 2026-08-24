export type BalanceMood =
  | "debt"
  | "alert"
  | "recovering"
  | "steady"
  | "happy"
  | "celebrating";

export function balanceMoodFor(realizedCents: number): BalanceMood {
  if (realizedCents < 0) return "debt";
  if (realizedCents < 5_000) return "alert";
  if (realizedCents <= 15_000) return "recovering";
  if (realizedCents <= 30_000) return "steady";
  if (realizedCents <= 50_000) return "happy";
  return "celebrating";
}
