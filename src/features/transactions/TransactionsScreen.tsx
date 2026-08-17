import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import MonthSelector from "../dashboard/MonthSelector";
import TransactionForm from "./TransactionForm";
import TransactionList from "./TransactionList";
import { calculateMonthlyResult } from "./summary";
import {
  createTransaction,
  deleteTransaction,
  listTransactionsByMonth,
  updateTransaction,
} from "../../lib/repositories/transactions";
import { listCategories } from "../../lib/repositories/categories";
import { formatDateBR, formatMonthLabel } from "../../lib/date";
import { formatSignedBRL } from "../../lib/currency";
import type {
  Category,
  CreateTransactionInput,
  TransactionWithCategory,
} from "../../lib/types";

type FormState =
  | { mode: "create" }
  | { mode: "edit"; transaction: TransactionWithCategory }
  | null;

const selectClass =
  "h-11 w-full max-w-56 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-2 focus:outline-ring";

function signColor(cents: number): string {
  if (cents > 0) return "text-success";
  if (cents < 0) return "text-danger";
  return "text-foreground";
}

export default function TransactionsScreen() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>(
    [],
  );
  const [filterCategory, setFilterCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<TransactionWithCategory | null>(null);

  const load = useCallback(async (nextYear: number, nextMonth: number) => {
    setLoading(true);
    setError(null);
    try {
      setTransactions(await listTransactionsByMonth(nextYear, nextMonth));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar movimentações.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [load, year, month]);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Erro ao carregar categorias.",
        );
      });
  }, []);

  const handleMonthChange = useCallback(
    (nextYear: number, nextMonth: number) => {
      setYear(nextYear);
      setMonth(nextMonth);
    },
    [],
  );

  const handleSubmit = async (values: CreateTransactionInput) => {
    if (formState?.mode === "edit") {
      await updateTransaction(formState.transaction.id, values);
    } else {
      await createTransaction(values);
    }
    setFormState(null);
    await load(year, month);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTransaction(deleteTarget.id);
      setDeleteTarget(null);
      await load(year, month);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao excluir transação.",
      );
    }
  };

  const filtered =
    filterCategory === "all"
      ? transactions
      : transactions.filter(
          (transaction) => transaction.category_id === filterCategory,
        );

  const summary = calculateMonthlyResult(transactions);

  return (
    <section
      className="space-y-6 p-4 md:p-8"
      aria-labelledby="transactions-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="transactions-title"
          className="text-xl font-semibold tracking-tight"
        >
          Movimentações
        </h2>
        <Button onClick={() => setFormState({ mode: "create" })}>
          <Plus className="size-4" aria-hidden />
          Adicionar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <MonthSelector year={year} month={month} onChange={handleMonthChange} />
        <select
          aria-label="Filtrar por categoria"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className={selectClass}
        >
          <option value="all">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {!error && loading && (
        <p className="text-sm text-muted-foreground" aria-busy="true">
          Carregando…
        </p>
      )}

      {!error && !loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <section
            className="rounded-lg border border-border bg-surface p-5"
            aria-label="Realizado no mês"
          >
            <p className="text-sm text-muted-foreground">Realizado</p>
            <p
              className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${signColor(summary.realized_cents)}`}
            >
              {formatSignedBRL(summary.realized_cents)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Movimentações efetivadas no mês.
            </p>
          </section>
          <section
            className="rounded-lg border border-border bg-surface p-5"
            aria-label="Projeção do mês"
          >
            <p className="text-sm text-muted-foreground">Projeção</p>
            <p
              className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${signColor(summary.projected_cents)}`}
            >
              {formatSignedBRL(summary.projected_cents)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Inclui movimentações previstas.
            </p>
          </section>
        </div>
      )}

      {!error && !loading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {filterCategory === "all" ? (
            <>
              Nenhuma movimentação em {formatMonthLabel(year, month)}.
              <br />
              <Button
                variant="ghost"
                className="mt-3"
                onClick={() => setFormState({ mode: "create" })}
              >
                <Plus className="size-4" aria-hidden />
                Adicionar a primeira
              </Button>
            </>
          ) : (
            `Nenhuma movimentação nessa categoria em ${formatMonthLabel(year, month)}.`
          )}
        </div>
      )}

      {!error && !loading && filtered.length > 0 && (
        <TransactionList
          transactions={filtered}
          onEdit={(transaction) =>
            setFormState({ mode: "edit", transaction })
          }
          onDelete={setDeleteTarget}
        />
      )}

      <Modal
        open={formState !== null}
        onClose={() => setFormState(null)}
        title={
          formState?.mode === "edit"
            ? "Editar movimentação"
            : "Nova movimentação"
        }
      >
        {formState && (
          <TransactionForm
            categories={categories}
            initial={formState.mode === "edit" ? formState.transaction : null}
            submitLabel={formState.mode === "edit" ? "Salvar" : "Adicionar"}
            onSubmit={handleSubmit}
            onCancel={() => setFormState(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir transação"
        message={
          deleteTarget
            ? `Excluir "${deleteTarget.description || "movimentação sem descrição"}" de ${formatDateBR(deleteTarget.date)}? Esta ação não pode ser desfeita.`
            : ""
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
