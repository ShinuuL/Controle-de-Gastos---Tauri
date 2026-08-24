import { describe, expect, it } from "vitest";
import type { StatementImportPreview } from "./importController";
import {
  canConfirmImport,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_REVIEW_ROWS,
  readImportFileForReview,
  transitionImportState,
  validateImportFileSize,
  validateImportReviewSize,
} from "./importController";

const preview: StatementImportPreview = {
  fileName: "extrato.csv",
  reconciliation: { newRows: [], conflicts: [], duplicates: [] },
  issues: [],
};

describe("controlador da importação na tela de movimentações", () => {
  it("avança de leitura para prévia somente depois do parsing", () => {
    const parsing = transitionImportState(
      { kind: "idle" },
      { type: "parsingStarted", fileName: "extrato.csv" },
    );
    const ready = transitionImportState(parsing.state, {
      type: "previewReady",
      preview,
    });

    expect(parsing).toEqual({
      state: { kind: "parsing", fileName: "extrato.csv" },
    });
    expect(ready).toEqual({ state: { kind: "preview", preview } });
  });

  it("retém a mesma prévia e o erro seguro quando a confirmação falha", () => {
    const confirming = transitionImportState(
      { kind: "preview", preview },
      { type: "confirmationStarted", canConfirm: true },
    );
    const failed = transitionImportState(confirming.state, {
      type: "confirmationFailed",
      message: "Não foi possível importar as movimentações.",
    });

    expect(failed).toEqual({
      state: {
        kind: "error",
        preview,
        message: "Não foi possível importar as movimentações.",
      },
    });
  });

  it("fecha a prévia e emite a intenção de recarregar após confirmação", () => {
    const confirming = transitionImportState(
      { kind: "preview", preview },
      { type: "confirmationStarted", canConfirm: true },
    );
    const succeeded = transitionImportState(confirming.state, {
      type: "confirmationSucceeded",
    });

    expect(succeeded).toEqual({
      state: { kind: "idle" },
      intent: "reloadMonthAndCategories",
    });
  });

  it("não inicia confirmação quando a seleção ainda falha na categoria", () => {
    const current = { kind: "preview" as const, preview };

    expect(
      transitionImportState(current, {
        type: "confirmationStarted",
        canConfirm: false,
      }),
    ).toEqual({ state: current });
  });

  it("calcula o gate com linhas reais e recusa categoria vazia", () => {
    expect(canConfirmImport([])).toBe(false);
    expect(canConfirmImport([{ category_id: "   " }])).toBe(false);
    expect(
      canConfirmImport([
        { category_id: "alimentacao" },
        { category_id: "moradia" },
      ]),
    ).toBe(true);
  });

  it("recusa arquivo acima de 5 MiB antes da leitura", () => {
    expect(validateImportFileSize(MAX_IMPORT_FILE_BYTES)).toBeNull();
    expect(validateImportFileSize(MAX_IMPORT_FILE_BYTES + 1)).toBe(
      "Arquivo CSV excede o limite de 5 MiB.",
    );
  });

  it("não chama arrayBuffer quando o arquivo já excede 5 MiB", async () => {
    let readCount = 0;
    const file = {
      size: MAX_IMPORT_FILE_BYTES + 1,
      async arrayBuffer(): Promise<ArrayBuffer> {
        readCount += 1;
        return new ArrayBuffer(0);
      },
    };

    await expect(readImportFileForReview(file)).rejects.toThrow(
      "Arquivo CSV excede o limite de 5 MiB.",
    );
    expect(readCount).toBe(0);
  });

  it("recusa prévia acima do limite seguro de linhas", () => {
    expect(validateImportReviewSize(MAX_IMPORT_REVIEW_ROWS)).toBeNull();
    expect(validateImportReviewSize(MAX_IMPORT_REVIEW_ROWS + 1)).toBe(
      `Este arquivo tem mais de ${MAX_IMPORT_REVIEW_ROWS} linhas. Exporte um período menor para revisar a importação.`,
    );
  });

  it("recusa mais de 500 linhas válidas antes de criar a prévia", async () => {
    const rows = Array.from(
      { length: MAX_IMPORT_REVIEW_ROWS + 1 },
      (_, index) =>
        `05/01/2026;Linha ${index + 1};12,50;D`,
    );
    const bytes = new TextEncoder().encode(
      `Data;Histórico;Valor;Tipo\n${rows.join("\n")}`,
    );

    await expect(
      readImportFileForReview({
        size: bytes.byteLength,
        async arrayBuffer() {
          return bytes.buffer;
        },
      }),
    ).rejects.toThrow(
      `Este arquivo tem mais de ${MAX_IMPORT_REVIEW_ROWS} linhas.`,
    );
  });
});
