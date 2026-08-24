import {
  parseItauCsv,
  type CsvIssue,
  type ParsedStatement,
} from "./itauCsv";
import type { ReconciliationResult } from "./reconciliation";
import type { ReconciliationCandidate } from "./reconciliation";
import type { ApprovedImportLine } from "../../lib/types";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
// A prévia renderiza controles por linha; este limite mantém o DOM utilizável.
export const MAX_IMPORT_REVIEW_ROWS = 500;

export interface StatementImportPreview {
  fileName: string;
  reconciliation: ReconciliationResult;
  issues: CsvIssue[];
}

export type ImportState =
  | { kind: "idle" }
  | { kind: "parsing"; fileName: string }
  | { kind: "preview"; preview: StatementImportPreview }
  | { kind: "confirming"; preview: StatementImportPreview }
  | {
      kind: "error";
      message: string;
      preview?: StatementImportPreview;
    };

export type ImportAction =
  | { type: "parsingStarted"; fileName: string }
  | { type: "previewReady"; preview: StatementImportPreview }
  | { type: "operationFailed"; message: string }
  | { type: "confirmationStarted"; canConfirm: boolean }
  | { type: "confirmationFailed"; message: string }
  | { type: "confirmationSucceeded" }
  | { type: "closed" };

export interface ImportTransition {
  state: ImportState;
  intent?: "reloadMonthAndCategories";
}

export interface ImportPreviewDependencies {
  findCandidates: (
    rows: ParsedStatement["rows"],
  ) => Promise<ReconciliationCandidate[]>;
  reconcile: (
    rows: ParsedStatement["rows"],
    candidates: ReconciliationCandidate[],
  ) => ReconciliationResult;
}

export interface ImportConfirmationDependencies {
  confirm: (lines: ApprovedImportLine[]) => Promise<unknown>;
  reload: () => Promise<void>;
  publishState?: (state: ImportState) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function parseImportBytes(bytes: ArrayBuffer): ParsedStatement {
  const parsed = parseItauCsv(bytes);
  const reviewSizeError = validateImportReviewSize(
    parsed.rows.length + parsed.issues.length,
  );
  if (reviewSizeError) throw new Error(reviewSizeError);
  return parsed;
}

export async function prepareImportPreview(
  input: { fileName: string; bytes: ArrayBuffer },
  dependencies: ImportPreviewDependencies,
): Promise<ImportState> {
  let parsed: ParsedStatement;
  try {
    parsed = parseImportBytes(input.bytes);
  } catch (error) {
    return {
      kind: "error",
      message: errorMessage(
        error,
        "Não foi possível interpretar o extrato CSV.",
      ),
    };
  }

  try {
    const candidates = await dependencies.findCandidates(parsed.rows);
    return {
      kind: "preview",
      preview: {
        fileName: input.fileName,
        reconciliation: dependencies.reconcile(parsed.rows, candidates),
        issues: parsed.issues,
      },
    };
  } catch {
    return {
      kind: "error",
      message: "Não foi possível comparar o extrato com as movimentações.",
    };
  }
}

export async function confirmImportPreview(
  state: ImportState,
  lines: ApprovedImportLine[],
  dependencies: ImportConfirmationDependencies,
): Promise<ImportState> {
  const confirmation = transitionImportState(state, {
    type: "confirmationStarted",
    canConfirm: canConfirmImport(lines),
  });
  if (confirmation.state.kind !== "confirming") return confirmation.state;

  dependencies.publishState?.(confirmation.state);
  try {
    await dependencies.confirm(lines);
  } catch (error) {
    const failed = transitionImportState(confirmation.state, {
      type: "confirmationFailed",
      message: errorMessage(
        error,
        "Não foi possível importar as movimentações.",
      ),
    }).state;
    dependencies.publishState?.(failed);
    return failed;
  }

  const success = transitionImportState(confirmation.state, {
    type: "confirmationSucceeded",
  });
  dependencies.publishState?.(success.state);
  if (success.intent === "reloadMonthAndCategories") {
    await dependencies.reload();
  }
  return success.state;
}

export function canConfirmImport(
  lines: ReadonlyArray<{ category_id: string }>,
): boolean {
  return (
    lines.length > 0 && lines.every((line) => line.category_id.trim().length > 0)
  );
}

export function transitionImportState(
  state: ImportState,
  action: ImportAction,
): ImportTransition {
  switch (action.type) {
    case "parsingStarted":
      return {
        state: { kind: "parsing", fileName: action.fileName },
      };
    case "previewReady":
      return state.kind === "parsing"
        ? { state: { kind: "preview", preview: action.preview } }
        : { state };
    case "operationFailed":
      return { state: { kind: "error", message: action.message } };
    case "confirmationStarted": {
      const preview =
        state.kind === "preview" || state.kind === "error"
          ? state.preview
          : undefined;
      return action.canConfirm && preview
        ? { state: { kind: "confirming", preview } }
        : { state };
    }
    case "confirmationFailed":
      return state.kind === "confirming"
        ? {
            state: {
              kind: "error",
              preview: state.preview,
              message: action.message,
            },
          }
        : { state };
    case "confirmationSucceeded":
      return state.kind === "confirming"
        ? {
            state: { kind: "idle" },
            intent: "reloadMonthAndCategories",
          }
        : { state };
    case "closed":
      return { state: { kind: "idle" } };
  }
}

export function validateImportFileSize(size: number): string | null {
  return size > MAX_IMPORT_FILE_BYTES
    ? "Arquivo CSV excede o limite de 5 MiB."
    : null;
}

export function validateImportReviewSize(rowCount: number): string | null {
  return rowCount > MAX_IMPORT_REVIEW_ROWS
    ? `Este arquivo tem mais de ${MAX_IMPORT_REVIEW_ROWS} linhas. Exporte um período menor para revisar a importação.`
    : null;
}

interface ImportFileReader {
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export async function readImportFileBytes(
  file: ImportFileReader,
): Promise<ArrayBuffer> {
  const fileSizeError = validateImportFileSize(file.size);
  if (fileSizeError) throw new Error(fileSizeError);

  try {
    return await file.arrayBuffer();
  } catch {
    throw new Error("Não foi possível ler o arquivo selecionado.");
  }
}
