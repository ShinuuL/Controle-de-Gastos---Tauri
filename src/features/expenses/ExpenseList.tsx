import { Pencil, Trash2 } from "lucide-react";
import { formatBRL } from "../../lib/currency";
import { formatDateBR } from "../../lib/date";
import type { ExpenseWithCategory } from "../../lib/types";

interface ExpenseListProps {
  expenses: ExpenseWithCategory[];
  onEdit: (expense: ExpenseWithCategory) => void;
  onDelete: (expense: ExpenseWithCategory) => void;
}

export default function ExpenseList({
  expenses,
  onEdit,
  onDelete,
}: ExpenseListProps) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {expenses.map((expense) => (
        <li key={expense.id} className="flex items-center gap-4 p-3">
          <time
            dateTime={expense.date}
            className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {formatDateBR(expense.date)}
          </time>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {expense.description || (
                <span className="font-normal text-muted-foreground">—</span>
              )}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: expense.category_color }}
                aria-hidden
              />
              {expense.category_name}
            </p>
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {formatBRL(expense.amount_cents)}
          </span>
          <div className="flex shrink-0 gap-0.5">
            <button
              type="button"
              onClick={() => onEdit(expense)}
              aria-label={`Editar despesa de ${formatDateBR(expense.date)}`}
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onDelete(expense)}
              aria-label={`Excluir despesa de ${formatDateBR(expense.date)}`}
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
