import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import MonthSelector from "../dashboard/MonthSelector";
import ExpenseForm, { type ExpenseFormValues } from "./ExpenseForm";
import ExpenseList from "./ExpenseList";
import {
  createExpense,
  deleteExpense,
  listExpensesByMonth,
  updateExpense,
} from "../../lib/repositories/expenses";
import { listCategories } from "../../lib/repositories/categories";
import { formatMonthLabel } from "../../lib/date";
import type { Category, ExpenseWithCategory } from "../../lib/types";

type FormState = { mode: "create" } | { mode: "edit"; expense: ExpenseWithCategory } | null;

const selectClass =
  "h-11 w-full max-w-56 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-2 focus:outline-ring";

export default function ExpensesScreen() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);
  const [filterCategory, setFilterCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseWithCategory | null>(null);

  const load = useCallback(async (nextYear: number, nextMonth: number) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listExpensesByMonth(nextYear, nextMonth);
      setExpenses(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar despesas.");
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
        setError(err instanceof Error ? err.message : "Erro ao carregar categorias.");
      });
  }, []);

  const handleMonthChange = useCallback((nextYear: number, nextMonth: number) => {
    setYear(nextYear);
    setMonth(nextMonth);
  }, []);

  const handleSubmit = async (values: ExpenseFormValues) => {
    if (formState?.mode === "edit") {
      await updateExpense(formState.expense.id, values);
    } else {
      await createExpense(values);
    }
    setFormState(null);
    await load(year, month);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteExpense(deleteTarget.id);
    setDeleteTarget(null);
    await load(year, month);
  };

  const filtered =
    filterCategory === "all"
      ? expenses
      : expenses.filter((expense) => expense.category_id === filterCategory);

  return (
    <section className="space-y-6 p-4 md:p-8" aria-labelledby="expenses-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="expenses-title" className="text-xl font-semibold tracking-tight">
          Despesas
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
        <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!error && !loading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma despesa em {formatMonthLabel(year, month)}.
          <br />
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => setFormState({ mode: "create" })}
          >
            <Plus className="size-4" aria-hidden />
            Adicionar a primeira
          </Button>
        </div>
      )}

      {!error && !loading && filtered.length > 0 && (
        <ExpenseList
          expenses={filtered}
          onEdit={(expense) => setFormState({ mode: "edit", expense })}
          onDelete={setDeleteTarget}
        />
      )}

      <Modal
        open={formState !== null}
        onClose={() => setFormState(null)}
        title={formState?.mode === "edit" ? "Editar despesa" : "Nova despesa"}
      >
        {formState && (
          <ExpenseForm
            categories={categories}
            initial={formState.mode === "edit" ? formState.expense : null}
            submitLabel={formState.mode === "edit" ? "Salvar" : "Adicionar"}
            onSubmit={handleSubmit}
            onCancel={() => setFormState(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir despesa"
        message={
          deleteTarget
            ? `Excluir "${deleteTarget.description || "despesa sem descrição"}" de ${formatMonthLabel(
                year,
                month,
              )}? Esta ação não pode ser desfeita.`
            : ""
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
