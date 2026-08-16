import type { MovementStatus } from "../../lib/types";

export function getTransactionStatusPresentation(status: MovementStatus) {
  return status === "previsto"
    ? {
        label: "Prevista",
        className: "border-warning bg-warning/10 text-foreground",
      }
    : {
        label: "Realizada",
        className: "bg-accent text-accent-foreground",
      };
}
