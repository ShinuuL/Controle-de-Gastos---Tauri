import { describe, expect, it } from "vitest";
import type { ParsedStatementRow } from "./itauCsv";
import type { ReconciliationResult } from "./reconciliation";
import {
  buildApprovedImportLines,
  createInitialImportReview,
  getInitialReviewTab,
  getImportReviewStatus,
  syncSuggestedCategories,
} from "./ImportStatementModal";

const row = (
  sourceRow: number,
  overrides: Partial<ParsedStatementRow> = {},
): ParsedStatementRow => ({
  sourceRow,
  date: "2026-01-05",
  description: `Linha ${sourceRow}`,
  amount_cents: 1_250,
  nature: "saida",
  ...overrides,
});

const result = (
  overrides: Partial<ReconciliationResult> = {},
): ReconciliationResult => ({
  newRows: [],
  conflicts: [],
  duplicates: [],
  ...overrides,
});

describe("revisão da importação de extrato", () => {
  it("pré-seleciona somente uma categoria sugerida que já existe", () => {
    const review = createInitialImportReview(
      result({
        newRows: [
          row(2, { suggestedCategoryName: " alimentação " }),
          row(3, { suggestedCategoryName: "Categoria do banco" }),
          row(4),
        ],
      }),
      [
        { id: "food", name: "Alimentação" },
        { id: "home", name: "Moradia" },
      ],
    );

    expect(review.map(({ categoryId }) => categoryId)).toEqual([
      "food",
      "",
      "",
    ]);
  });

  it("bloqueia confirmação enquanto houver conflito pendente ou linha selecionada sem categoria", () => {
    const review = createInitialImportReview(
      result({
        newRows: [row(2)],
        conflicts: [row(3, { nature: "entrada" })],
      }),
      [],
    );

    expect(getImportReviewStatus(review)).toEqual({
      importCount: 1,
      pendingConflicts: 1,
      missingCategories: 1,
      canConfirm: false,
    });

    const resolved = review.map((item) => ({
      ...item,
      decision: "import" as const,
      categoryId: "food",
    }));

    expect(getImportReviewStatus(resolved)).toEqual({
      importCount: 2,
      pendingConflicts: 0,
      missingCategories: 0,
      canConfirm: true,
    });
  });

  it("gera linhas aprovadas somente para decisões de importar e usa a natureza revisada", () => {
    const review = createInitialImportReview(
      result({
        newRows: [row(2), row(3)],
        conflicts: [row(4)],
      }),
      [],
    ).map((item) => {
      if (item.row.sourceRow === 2) {
        return { ...item, categoryId: "salary", nature: "entrada" as const };
      }
      if (item.row.sourceRow === 3) {
        return { ...item, decision: "ignore" as const };
      }
      return {
        ...item,
        decision: "import" as const,
        categoryId: "food",
      };
    });

    expect(buildApprovedImportLines(review)).toEqual([
      {
        category_id: "salary",
        description: "Linha 2",
        amount_cents: 1_250,
        date: "2026-01-05",
        nature: "entrada",
        fingerprint: "2026-01-05|entrada|1250|linha 2",
      },
      {
        category_id: "food",
        description: "Linha 4",
        amount_cents: 1_250,
        date: "2026-01-05",
        nature: "saida",
        fingerprint: "2026-01-05|saida|1250|linha 4",
      },
    ]);
  });

  it("recusa gerar payload quando uma linha escolhida continua sem categoria", () => {
    const review = createInitialImportReview(
      result({ newRows: [row(2)] }),
      [],
    );

    expect(() => buildApprovedImportLines(review)).toThrow(
      "Selecione uma categoria para todas as movimentações escolhidas.",
    );
  });

  it("sincroniza sugestões quando categorias chegam sem sobrescrever escolha existente", () => {
    const review = createInitialImportReview(
      result({
        newRows: [
          row(2, { suggestedCategoryName: "Alimentação" }),
          row(3, { suggestedCategoryName: "Moradia" }),
        ],
      }),
      [],
    ).map((item) =>
      item.row.sourceRow === 3 ? { ...item, categoryId: "custom" } : item,
    );

    expect(
      syncSuggestedCategories(review, [
        { id: "food", name: "Alimentação" },
        { id: "home", name: "Moradia" },
      ]).map(({ categoryId }) => categoryId),
    ).toEqual(["food", "custom"]);
  });

  it("escolhe primeiro grupo não vazio priorizando estados acionáveis", () => {
    expect(
      getInitialReviewTab(
        result({ conflicts: [row(2)], duplicates: [row(3)] }),
        [],
      ),
    ).toBe("conflict");
    expect(
      getInitialReviewTab(result({ duplicates: [row(3)] }), []),
    ).toBe("duplicate");
  });
});
