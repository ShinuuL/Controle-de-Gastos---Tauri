import { useState, type FormEvent } from "react";
import Button from "../../components/ui/Button";
import { formatCentsInput, parseToCents } from "../../lib/currency";
import { todayISO } from "../../lib/date";
import type { Category, Expense } from "../../lib/types";

export interface ExpenseFormValues {
  category_id: string;
  description: string;
  amount_cents: number;
  date: string;
}

interface ExpenseFormProps {
  categories: Category[];
  initial?: Expense | null;
  submitLabel: string;
  onSubmit: (values: ExpenseFormValues) => Promise<void> | void;
  onCancel: () => void;
}

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-ring";

export default function ExpenseForm({
  categories,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: ExpenseFormProps) {
  const [amount, setAmount] = useState(initial ? formatCentsInput(initial.amount_cents) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? categories[0]?.id ?? "");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cents = parseToCents(amount);
    if (cents === null || cents <= 0) {
      setError("Informe um valor válido maior que zero (ex.: 49,90).");
      return;
    }
    if (!categoryId) {
      setError("Selecione uma categoria.");
      return;
    }
    if (!date) {
      setError("Informe a data.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        category_id: categoryId,
        description: description.trim(),
        amount_cents: cents,
        date,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="expense-amount" className="mb-1 block text-sm font-medium">
          Valor
        </label>
        <input
          id="expense-amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClass}
          autoFocus
        />
      </div>

      <div>
        <label htmlFor="expense-description" className="mb-1 block text-sm font-medium">
          Descrição
        </label>
        <input
          id="expense-description"
          type="text"
          placeholder="Ex.: Compras do mercado"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="expense-category" className="mb-1 block text-sm font-medium">
          Categoria
        </label>
        <select
          id="expense-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={inputClass}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="expense-date" className="mb-1 block text-sm font-medium">
          Data
        </label>
        <input
          id="expense-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
