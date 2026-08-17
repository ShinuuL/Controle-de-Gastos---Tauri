import { Pencil, Trash2 } from "lucide-react";
import { formatSignedBRL } from "../../lib/currency";
import { formatDateBR } from "../../lib/date";
import { getTransactionStatusPresentation } from "./status";
import type { TransactionWithCategory } from "../../lib/types";

interface TransactionListProps {
  transactions: TransactionWithCategory[];
  onEdit: (transaction: TransactionWithCategory) => void;
  onDelete: (transaction: TransactionWithCategory) => void;
}

export default function TransactionList({
  transactions,
  onEdit,
  onDelete,
}: TransactionListProps) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {transactions.map((transaction) => {
        const status = getTransactionStatusPresentation(transaction.status);
        const isEntrada = transaction.nature === "entrada";
        return (
          <li key={transaction.id} className="flex items-center gap-4 p-3">
            <time
              dateTime={transaction.date}
              className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground"
            >
              {formatDateBR(transaction.date)}
            </time>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {transaction.description || (
                  <span className="font-normal text-muted-foreground">—</span>
                )}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: transaction.category_color }}
                  aria-hidden
                />
                <span className="min-w-0 truncate">
                  {transaction.category_name}
                </span>
                <span
                  className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${status.className}`}
                >
                  {status.label}
                </span>
              </p>
            </div>
            <span
              aria-label={isEntrada ? "Entrada" : "Saída"}
              className={`shrink-0 text-sm font-medium tabular-nums ${
                isEntrada ? "text-success" : "text-foreground"
              }`}
            >
              {formatSignedBRL(
                isEntrada ? transaction.amount_cents : -transaction.amount_cents,
              )}
            </span>
            <div className="flex shrink-0 gap-0.5">
              <button
                type="button"
                onClick={() => onEdit(transaction)}
                aria-label={`Editar movimentação de ${formatDateBR(transaction.date)}`}
                className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onDelete(transaction)}
                aria-label={`Excluir movimentação de ${formatDateBR(transaction.date)}`}
                className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
