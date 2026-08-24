import {
  parseItauCsv,
  type CsvIssue,
  type ParsedStatement,
} from "./itauCsv";
import type { ReconciliationResult } from "./reconciliation";

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

export async function readImportFileForReview(
  file: ImportFileReader,
): Promise<ParsedStatement> {
  const fileSizeError = validateImportFileSize(file.size);
  if (fileSizeError) throw new Error(fileSizeError);

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new Error("Não foi possível ler o arquivo selecionado.");
  }

  const parsed = parseItauCsv(bytes);
  const reviewSizeError = validateImportReviewSize(
    parsed.rows.length + parsed.issues.length,
  );
  if (reviewSizeError) throw new Error(reviewSizeError);
  return parsed;
}
