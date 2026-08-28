import { describe, expect, it } from "vitest";
import type { StatementImportPreview } from "./importController";
import {
  canConfirmImport,
  confirmImportPreview,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_REVIEW_ROWS,
  prepareImportPreview,
  readImportFileBytes,
  transitionImportState,
  validateImportFileType,
  validateImportFileSize,
  validateImportReviewSize,
} from "./importController";
import { reconcileStatement } from "./reconciliation";
import type { ApprovedImportLine } from "../../lib/types";

const preview: StatementImportPreview = {
  fileName: "extrato.csv",
  reconciliation: { newRows: [], conflicts: [], duplicates: [] },
  issues: [],
};

const approvedLine: ApprovedImportLine = {
  date: "2026-01-06",
  description: "Compra de teste",
  amount_cents: 2_500,
  nature: "saida",
  category_id: "categoria-teste",
  fingerprint: "2026-01-06|saida|2500|compra de teste",
};

describe("controlador da importação na tela de movimentações", () => {
  it("orquestra bytes → parser → candidatos → conciliação → prévia", async () => {
    const calls: string[] = [];
    const bytes = new TextEncoder().encode(
      [
        "Data;Histórico;Valor;Tipo",
        "05/01/2026;Item repetido;12,50;D",
        "06/01/2026;Item novo;25,00;C",
      ].join("\n"),
    ).buffer;

    const state = await prepareImportPreview(
      { fileName: "qa.csv", bytes },
      {
        async findCandidates(rows) {
          calls.push(`candidatos:${rows.length}`);
          return [
            {
              id: "existente",
              date: "2026-01-05",
              description: "Item repetido",
              amount_cents: 1_250,
              nature: "saida",
            },
          ];
        },
        reconcile(rows, candidates) {
          calls.push(`conciliar:${candidates.length}`);
          return reconcileStatement(rows, candidates);
        },
      },
    );

    expect(calls).toEqual(["candidatos:2", "conciliar:1"]);
    expect(state).toEqual({
      kind: "preview",
      preview: {
        fileName: "qa.csv",
        issues: [],
        reconciliation: {
          newRows: [
            expect.objectContaining({
              sourceRow: 3,
              description: "Item novo",
              amount_cents: 2_500,
              nature: "entrada",
            }),
          ],
          conflicts: [],
          duplicates: [
            expect.objectContaining({
              sourceRow: 2,
              description: "Item repetido",
            }),
          ],
        },
      },
    });
  });

  it("confirma no repositório, fecha e só então recarrega", async () => {
    const calls: string[] = [];
    const state = await confirmImportPreview(
      { kind: "preview", preview },
      [approvedLine],
      {
        async confirm(lines) {
          calls.push(`confirmar:${lines.length}`);
        },
        async reload() {
          calls.push("recarregar");
        },
        publishState(nextState) {
          calls.push(`estado:${nextState.kind}`);
        },
      },
    );

    expect(calls).toEqual([
      "estado:confirming",
      "confirmar:1",
      "estado:idle",
      "recarregar",
    ]);
    expect(state).toEqual({ kind: "idle" });
  });

  it("retém a prévia e expõe erro quando o repositório falha", async () => {
    let reloadCount = 0;
    const publishedStates: string[] = [];
    const state = await confirmImportPreview(
      { kind: "preview", preview },
      [approvedLine],
      {
        async confirm() {
          throw new Error("Falha controlada");
        },
        async reload() {
          reloadCount += 1;
        },
        publishState(nextState) {
          publishedStates.push(nextState.kind);
        },
      },
    );

    expect(reloadCount).toBe(0);
    expect(publishedStates).toEqual(["confirming", "error"]);
    expect(state).toEqual({
      kind: "error",
      preview,
      message: "Falha controlada",
    });
  });

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
      "Arquivo excede o limite de 5 MiB.",
    );
  });

  it("aceita PDF do Itaú para a prévia", () => {
    expect(
      validateImportFileType({
        name: "extrato-itau.pdf",
        type: "application/pdf",
      }),
    ).toBeNull();
  });

  it("recusa formatos que não são extrato do Itaú", () => {
    expect(
      validateImportFileType({ name: "extrato.ofx", type: "application/x-ofx" }),
    ).toBe("Formato não suportado. Importe o extrato do Itaú em CSV ou PDF.");
  });

  it("mantém arquivos CSV elegíveis para a prévia", () => {
    expect(
      validateImportFileType({ name: "extrato-itau.csv", type: "text/csv" }),
    ).toBeNull();
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

    await expect(readImportFileBytes(file)).rejects.toThrow(
      "Arquivo excede o limite de 5 MiB.",
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
    let candidateLookupCount = 0;
    const rows = Array.from(
      { length: MAX_IMPORT_REVIEW_ROWS + 1 },
      (_, index) =>
        `05/01/2026;Linha ${index + 1};12,50;D`,
    );
    const bytes = new TextEncoder().encode(
      `Data;Histórico;Valor;Tipo\n${rows.join("\n")}`,
    );

    const state = await prepareImportPreview(
      { fileName: "grande.csv", bytes: bytes.buffer },
      {
        async findCandidates() {
          candidateLookupCount += 1;
          return [];
        },
        reconcile: reconcileStatement,
      },
    );

    expect(candidateLookupCount).toBe(0);
    expect(state).toEqual({
      kind: "error",
      message: `Este arquivo tem mais de ${MAX_IMPORT_REVIEW_ROWS} linhas. Exporte um período menor para revisar a importação.`,
    });
  });
});
