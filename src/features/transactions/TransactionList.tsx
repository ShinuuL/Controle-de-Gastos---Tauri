import { Pencil, Trash2 } from "lucide-react";
import { formatSignedBRL } from "../../lib/currency";
import { formatDateBR } from "../../lib/date";
import { getTransactionStatusPresentation } from "./status";
import type { TransactionWithCategory } from "../../lib/types";
import CategoryMarker from "../../components/ui/CategoryMarker";
import { useTheme } from "../theme/ThemeProvider";

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
  const { resolvedTheme } = useTheme();

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {transactions.map((transaction) => {
        const status = getTransactionStatusPresentation(transaction.status);
        const isEntrada = transaction.nature === "entrada";
        return (
          <li key={transaction.id} className="flex flex-col gap-2 p-3">
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 break-words text-sm font-medium line-clamp-2">
                {transaction.description || (
                  <span className="font-normal text-muted-foreground">—</span>
                )}
              </p>
              <span
                aria-label={isEntrada ? "Entrada" : "Saída"}
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  isEntrada ? "text-success" : "text-foreground"
                }`}
              >
                {formatSignedBRL(
                  isEntrada
                    ? transaction.amount_cents
                    : -transaction.amount_cents,
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <time
                  dateTime={transaction.date}
                  className="shrink-0 tabular-nums"
                >
                  {formatDateBR(transaction.date)}
                </time>
                <span className="flex min-w-0 items-center gap-1.5">
                  <CategoryMarker
                    color={transaction.category_color}
                    strawberry={resolvedTheme === "strawberry"}
                    size="compact"
                  />
                  <span className="min-w-0 truncate">
                    {transaction.category_name}
                  </span>
                </span>
                <span
                  className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${status.className}`}
                >
                  {status.label}
                </span>
              </div>
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
            </div>
          </li>
        );
      })}
    </ul>
  );
}
