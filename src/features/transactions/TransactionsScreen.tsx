import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { FileUp, LoaderCircle, Plus } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import MonthSelector from "../dashboard/MonthSelector";
import ImportStatementModal from "../imports/ImportStatementModal";
import { parseItauCsv, type CsvIssue } from "../imports/itauCsv";
import {
  reconcileStatement,
  type ReconciliationResult,
} from "../imports/reconciliation";
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
import {
  confirmStatementImport,
  findReconciliationCandidates,
} from "../../lib/repositories/imports";
import { formatDateBR, formatMonthLabel } from "../../lib/date";
import { formatSignedBRL } from "../../lib/currency";
import type {
  ApprovedImportLine,
  Category,
  CreateTransactionInput,
  TransactionWithCategory,
} from "../../lib/types";

type FormState =
  | { mode: "create" }
  | { mode: "edit"; transaction: TransactionWithCategory }
  | null;

interface StatementPreview {
  fileName: string;
  reconciliation: ReconciliationResult;
  issues: CsvIssue[];
}

type ImportState =
  | { kind: "idle" }
  | { kind: "parsing"; fileName: string }
  | { kind: "preview"; preview: StatementPreview }
  | { kind: "confirming"; preview: StatementPreview }
  | { kind: "error"; message: string; preview?: StatementPreview };

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
  const [importState, setImportState] = useState<ImportState>({ kind: "idle" });
  const importInputRef = useRef<HTMLInputElement>(null);

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

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await listCategories());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar categorias.",
      );
    }
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [load, year, month]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

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

  const onImported = useCallback(async (): Promise<void> => {
    await Promise.all([load(year, month), loadCategories()]);
  }, [load, loadCategories, month, year]);

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setImportState({ kind: "parsing", fileName: file.name });

    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      setImportState({
        kind: "error",
        message: "Não foi possível ler o arquivo selecionado.",
      });
      return;
    }

    let parsed: ReturnType<typeof parseItauCsv>;
    try {
      parsed = parseItauCsv(bytes);
    } catch (err) {
      setImportState({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Não foi possível interpretar o extrato CSV.",
      });
      return;
    }

    try {
      const candidates = await findReconciliationCandidates(parsed.rows);
      setImportState({
        kind: "preview",
        preview: {
          fileName: file.name,
          reconciliation: reconcileStatement(parsed.rows, candidates),
          issues: parsed.issues,
        },
      });
    } catch {
      setImportState({
        kind: "error",
        message: "Não foi possível comparar o extrato com as movimentações.",
      });
    }
  };

  const closeImport = useCallback(() => {
    setImportState({ kind: "idle" });
  }, []);

  const confirmImport = async (lines: ApprovedImportLine[]) => {
    if (importState.kind !== "preview" && importState.kind !== "error") {
      return;
    }
    const preview = importState.preview;
    if (!preview) return;

    setImportState({ kind: "confirming", preview });
    try {
      await confirmStatementImport(lines);
    } catch (err) {
      setImportState({
        kind: "error",
        preview,
        message:
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Não foi possível importar as movimentações.",
      });
      return;
    }

    setImportState({ kind: "idle" });
    await onImported();
  };

  const importPreview =
    importState.kind === "preview" ||
    importState.kind === "confirming" ||
    (importState.kind === "error" && importState.preview)
      ? importState.preview
      : undefined;

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-label="Selecionar extrato CSV do Itaú"
            onChange={(event) => void handleImportFile(event)}
          />
          <Button
            type="button"
            variant="ghost"
            className="whitespace-nowrap border border-border"
            disabled={importState.kind === "parsing"}
            onClick={() => importInputRef.current?.click()}
          >
            {importState.kind === "parsing" ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <FileUp className="size-4" aria-hidden />
            )}
            {importState.kind === "parsing"
              ? "Lendo extrato…"
              : "Importar extrato"}
          </Button>
          <Button onClick={() => setFormState({ mode: "create" })}>
            <Plus className="size-4" aria-hidden />
            Adicionar
          </Button>
        </div>
      </div>

      {importState.kind === "parsing" && (
        <p
          className="text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Preparando a prévia de {importState.fileName}…
        </p>
      )}

      {importState.kind === "error" && !importState.preview && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          {importState.message}
        </p>
      )}

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

      {importPreview && (
        <ImportStatementModal
          open
          fileName={importPreview.fileName}
          categories={categories}
          result={importPreview.reconciliation}
          issues={importPreview.issues}
          submitting={importState.kind === "confirming"}
          error={
            importState.kind === "error" && importState.preview
              ? importState.message
              : null
          }
          onConfirm={confirmImport}
          onClose={closeImport}
        />
      )}
    </section>
  );
}
