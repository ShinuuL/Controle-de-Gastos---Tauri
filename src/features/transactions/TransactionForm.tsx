import { useState, type FormEvent } from "react";
import Button from "../../components/ui/Button";
import { formatCentsInput, parseToCents } from "../../lib/currency";
import { todayISO } from "../../lib/date";
import type {
  Category,
  CreateTransactionInput,
  MovementNature,
  MovementStatus,
  Transaction,
} from "../../lib/types";

interface TransactionFormProps {
  categories: Category[];
  initial?: Transaction | null;
  submitLabel: string;
  onSubmit: (values: CreateTransactionInput) => Promise<void> | void;
  onCancel: () => void;
}

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-ring";

const segmentedButtonClass = (active: boolean) =>
  `h-9 flex-1 rounded-md text-sm font-medium transition-colors ${
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:text-foreground"
  }`;

export default function TransactionForm({
  categories,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const [amount, setAmount] = useState(
    initial ? formatCentsInput(initial.amount_cents) : "",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(
    initial?.category_id ?? categories[0]?.id ?? "",
  );
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [nature, setNature] = useState<MovementNature>(
    initial?.nature ?? "saida",
  );
  const [status, setStatus] = useState<MovementStatus>(
    initial?.status ?? "realizado",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const semCategorias = categories.length === 0;

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
        nature,
        status,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao salvar movimentação.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label
          htmlFor="transaction-amount"
          className="mb-1 block text-sm font-medium"
        >
          Valor
        </label>
        <input
          id="transaction-amount"
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
        <label
          htmlFor="transaction-description"
          className="mb-1 block text-sm font-medium"
        >
          Descrição
        </label>
        <input
          id="transaction-description"
          type="text"
          placeholder="Ex.: Compras do mercado"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="transaction-category"
          className="mb-1 block text-sm font-medium"
        >
          Categoria
        </label>
        <select
          id="transaction-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={inputClass}
          disabled={semCategorias}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {/* Lista vazia deixou de ser impossivel quando as predefinidas passaram
            a poder ser excluidas. Sem este aviso o select fica em branco e o
            salvar so reclama depois de a pessoa preencher o resto. */}
        {semCategorias && (
          <p className="mt-1 text-sm text-muted-foreground">
            Você não tem nenhuma categoria. Crie uma em <strong>Categorias</strong> antes
            de lançar.
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="transaction-date"
          className="mb-1 block text-sm font-medium"
        >
          Data
        </label>
        <input
          id="transaction-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Natureza</legend>
        <div className="flex rounded-lg border border-border bg-background p-1">
          <button
            type="button"
            aria-pressed={nature === "entrada"}
            onClick={() => setNature("entrada")}
            className={segmentedButtonClass(nature === "entrada")}
          >
            Entrada
          </button>
          <button
            type="button"
            aria-pressed={nature === "saida"}
            onClick={() => setNature("saida")}
            className={segmentedButtonClass(nature === "saida")}
          >
            Saída
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Status</legend>
        <div className="flex rounded-lg border border-border bg-background p-1">
          <button
            type="button"
            aria-pressed={status === "previsto"}
            onClick={() => setStatus("previsto")}
            className={segmentedButtonClass(status === "previsto")}
          >
            Prevista
          </button>
          <button
            type="button"
            aria-pressed={status === "realizado"}
            onClick={() => setStatus("realizado")}
            className={segmentedButtonClass(status === "realizado")}
          >
            Realizada
          </button>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || semCategorias}>
          {submitting ? "Salvando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
