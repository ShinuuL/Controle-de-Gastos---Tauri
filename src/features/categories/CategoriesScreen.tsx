import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import MonthSelector from "../dashboard/MonthSelector";
import { formatBRL, formatCentsInput, parseToCents } from "../../lib/currency";
import {
  createCategory,
  deleteCategory,
  listCategoryBudgetProgress,
  updateCategoryBudget,
  updateCategoryColor,
} from "../../lib/repositories/categories";
import type { CategoryBudgetProgress } from "../../lib/types";
import { getCategoryBudgetProgress } from "./budget";
import CategoryMarker from "../../components/ui/CategoryMarker";
import ColorPicker, { SUGGESTED_COLORS } from "../../components/ui/ColorPicker";
import { useTheme } from "../theme/ThemeProvider";

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-ring";

type FormState =
  | { mode: "create" }
  | { mode: "budget"; category: CategoryBudgetProgress }
  | null;

export default function CategoriesScreen() {
  const { resolvedTheme } = useTheme();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [categories, setCategories] = useState<CategoryBudgetProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<CategoryBudgetProgress | null>(null);

  const load = useCallback(async (nextYear: number, nextMonth: number) => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await listCategoryBudgetProgress(nextYear, nextMonth));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar categorias.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [load, year, month]);

  const reload = async () => {
    await load(year, month);
  };
  const handleCreate = async (
    name: string,
    color: string,
    budgetMonthly: number | null,
  ) => {
    await createCategory({
      name,
      color,
      icon: "tag",
      budget_monthly: budgetMonthly,
    });
    setFormState(null);
    await reload();
  };
  const handleEdit = async (budget: number | null, color: string) => {
    if (formState?.mode !== "budget") return;
    if (budget !== formState.category.budget_monthly) {
      await updateCategoryBudget(formState.category.id, budget);
    }
    if (color !== formState.category.color) {
      await updateCategoryColor(formState.category.id, color);
    }
    setFormState(null);
    await reload();
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao excluir categoria.",
      );
    }
  };

  return (
    <section
      className="space-y-6 p-4 md:p-8"
      aria-labelledby="categories-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="categories-title"
          className="text-xl font-semibold tracking-tight"
        >
          Categorias
        </h2>
        <Button onClick={() => setFormState({ mode: "create" })}>
          <Plus className="size-4" aria-hidden />
          Nova categoria
        </Button>
      </div>
      <MonthSelector
        year={year}
        month={month}
        onChange={(nextYear, nextMonth) => {
          setYear(nextYear);
          setMonth(nextMonth);
        }}
      />
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
      {!error && !loading && categories.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma categoria cadastrada.
        </div>
      )}
      {!error && !loading && categories.length > 0 && (
        <ul className="space-y-3" aria-label="Categorias e orçamentos">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              strawberry={resolvedTheme === "strawberry"}
              onEditBudget={() => setFormState({ mode: "budget", category })}
              onDelete={() => setDeleteTarget(category)}
            />
          ))}
        </ul>
      )}
      <Modal
        open={formState !== null}
        onClose={() => setFormState(null)}
        title={
          formState?.mode === "budget" ? "Editar categoria" : "Nova categoria"
        }
      >
        {formState?.mode === "create" && (
          <CategoryForm
            strawberry={resolvedTheme === "strawberry"}
            onSubmit={handleCreate}
            onCancel={() => setFormState(null)}
          />
        )}
        {formState?.mode === "budget" && (
          <CategoryEditForm
            category={formState.category}
            strawberry={resolvedTheme === "strawberry"}
            onSubmit={handleEdit}
            onCancel={() => setFormState(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir categoria"
        message={
          deleteTarget
            ? `Excluir a categoria "${deleteTarget.name}"? Esta ação não pode ser desfeita.`
            : ""
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}

function CategoryCard({
  category,
  strawberry,
  onEditBudget,
  onDelete,
}: {
  category: CategoryBudgetProgress;
  strawberry: boolean;
  onEditBudget: () => void;
  onDelete: () => void;
}) {
  const progress = getCategoryBudgetProgress(category);
  const progressColor =
    progress.status === "over-budget"
      ? "bg-destructive"
      : progress.status === "near-limit"
        ? "bg-warning"
        : "bg-success";
  const detail =
    category.budget_monthly === null
      ? `Gasto no mês: ${formatBRL(category.spent_cents)}`
      : `${formatBRL(category.spent_cents)} de ${formatBRL(category.budget_monthly)}`;
  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <CategoryMarker color={category.color} strawberry={strawberry} />
              <h3 className="truncate font-medium">{category.name}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{detail}</p>
          </div>
        </div>
        <div className="flex shrink-0">
          <button
            type="button"
            onClick={onEditBudget}
            className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={`Editar ${category.name}`}
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          {/* Predefinida tambem sai: a lista e do usuario, nao nossa. O que
              barra a exclusao e ter lancamento, e quem decide isso e o
              repositorio. */}
          <button
            type="button"
            onClick={onDelete}
            className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={`Excluir ${category.name}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mt-3 text-sm font-medium">{progress.statusLabel}</p>
      <p className="text-sm text-muted-foreground">
        {progress.statusDescription}
      </p>
      {progress.overBudgetCents > 0 && (
        <p className="text-sm font-medium text-destructive">
          Acima do orçamento em {formatBRL(progress.overBudgetCents)}.
        </p>
      )}
      {category.budget_monthly !== null && (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-label={`Orçamento de ${category.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percentage}
            aria-valuetext={`${progress.statusLabel}: ${formatBRL(category.spent_cents)} de ${formatBRL(category.budget_monthly)} (${progress.actualPercentage}%)${progress.overBudgetCents > 0 ? `. Acima do orçamento em ${formatBRL(progress.overBudgetCents)}.` : ""}`}
            className="h-2 overflow-hidden rounded-full bg-background"
          >
            <div
              className={`h-full rounded-full ${progressColor}`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      )}
    </li>
  );
}

function CategoryForm({
  strawberry,
  onSubmit,
  onCancel,
}: {
  strawberry: boolean;
  onSubmit: (
    name: string,
    color: string,
    budgetMonthly: number | null,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(SUGGESTED_COLORS[0]);
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Informe o nome da categoria.");
      return;
    }
    const budgetMonthly = budget.trim() === "" ? null : parseToCents(budget);
    if (
      budgetMonthly !== null &&
      (budgetMonthly <= 0 || !Number.isSafeInteger(budgetMonthly))
    ) {
      setError("Informe um orçamento válido maior que zero.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(name, color, budgetMonthly);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar categoria.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <div>
        <label
          htmlFor="category-name"
          className="mb-1 block text-sm font-medium"
        >
          Nome da categoria
        </label>
        <input
          id="category-name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
          autoFocus
        />
      </div>
      <div>
        <label
          htmlFor="new-category-budget"
          className="mb-1 block text-sm font-medium"
        >
          Orçamento mensal (R$){" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <input
          id="new-category-budget"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          className={inputClass}
        />
      </div>
      <ColorPicker value={color} onChange={setColor} strawberry={strawberry} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Criar categoria"}
        </Button>
      </div>
    </form>
  );
}

function CategoryEditForm({
  category,
  strawberry,
  onSubmit,
  onCancel,
}: {
  category: CategoryBudgetProgress;
  strawberry: boolean;
  onSubmit: (budget: number | null, color: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(
    category.budget_monthly === null
      ? ""
      : formatCentsInput(category.budget_monthly),
  );
  const [color, setColor] = useState(category.color);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // Campo vazio é categoria sem orçamento: sem isso, quem só quer trocar a
    // cor de uma categoria que nunca teve limite ficava travado no formulário.
    const cents = value.trim() === "" ? null : parseToCents(value);
    if (cents !== null && (cents <= 0 || !Number.isSafeInteger(cents))) {
      setError("Informe um orçamento válido maior que zero.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(cents, color);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao salvar orçamento.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const clear = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(null, color);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao limpar orçamento.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cor e limite mensal de {category.name}.
      </p>
      <ColorPicker value={color} onChange={setColor} strawberry={strawberry} />
      <div>
        <label
          htmlFor="category-budget"
          className="mb-1 block text-sm font-medium"
        >
          Orçamento mensal (R$)
        </label>
        <input
          id="category-budget"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={inputClass}
          autoFocus
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        {category.budget_monthly !== null && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void clear()}
            disabled={submitting}
          >
            Limpar orçamento
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar orçamento"}
        </Button>
      </div>
    </form>
  );
}
