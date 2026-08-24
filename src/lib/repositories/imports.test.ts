import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovedImportLine, MovementNature } from "../types";

const dbMock = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("../db", () => dbMock);

const { getDb } = dbMock;

import {
  confirmStatementImport,
  findReconciliationCandidates,
} from "./imports";

interface StoredCategory {
  id: string;
  name: string;
  sort_order: number;
}

interface StoredExpense {
  id: string;
  category_id: string;
  description: string;
  amount_cents: number;
  date: string;
  nature: MovementNature;
  status: "realizado";
  import_fingerprint: string;
}

function approved(
  fingerprint: string,
  overrides: Partial<ApprovedImportLine> = {},
): ApprovedImportLine {
  return {
    category_id: "food",
    description: "Almoço",
    amount_cents: 1250,
    date: "2026-01-10",
    nature: "saida",
    fingerprint,
    ...overrides,
  };
}

function statementRow(overrides: Partial<ApprovedImportLine> = {}) {
  return approved("candidate", overrides);
}

function createTransactionalFakeDb(options?: {
  categories?: StoredCategory[];
  expenses?: StoredExpense[];
  failOnInsert?: number;
}) {
  const persistedCategories = [...(options?.categories ?? [])];
  const persistedExpenses = [...(options?.expenses ?? [])];
  const selectCalls: Array<{ query: string; values?: unknown[] }> = [];
  const executeCalls: Array<{ query: string; values?: unknown[] }> = [];
  let categorySnapshot: StoredCategory[] | undefined;
  let expenseSnapshot: StoredExpense[] | undefined;
  let insertCount = 0;

  const db = {
    async select<T>(query: string, values?: unknown[]): Promise<T> {
      selectCalls.push({ query, values });
      if (query.includes("SELECT id FROM expenses WHERE import_fingerprint")) {
        const fingerprint = values?.[0];
        return persistedExpenses
          .filter((expense) => expense.import_fingerprint === fingerprint)
          .map(({ id }) => ({ id })) as T;
      }
      if (query.includes("FROM expenses")) {
        const [date, amount_cents, nature] = values as [
          string,
          number,
          MovementNature,
        ];
        return persistedExpenses
          .filter(
            (expense) =>
              expense.date === date &&
              expense.amount_cents === amount_cents &&
              expense.nature === nature,
          )
          .map(({ id, date, description, amount_cents, nature }) => ({
            id,
            date,
            description,
            amount_cents,
            nature,
          })) as T;
      }
      if (query.includes("SELECT id FROM categories")) {
        const id = values?.[0];
        return persistedCategories.filter((category) => category.id === id).map(({ id }) => ({ id })) as T;
      }
      if (query.includes("SELECT id, name FROM categories")) {
        const name = values?.[0];
        return persistedCategories
          .filter((category) => category.name === name)
          .map(({ id, name }) => ({ id, name })) as T;
      }
      if (query.includes("MAX(sort_order)")) {
        return [{ max: Math.max(-1, ...persistedCategories.map(({ sort_order }) => sort_order)) }] as T;
      }
      throw new Error(`Unexpected select query: ${query}`);
    },
    async execute(query: string, values?: unknown[]) {
      executeCalls.push({ query, values });
      if (query === "BEGIN IMMEDIATE") {
        categorySnapshot = structuredClone(persistedCategories);
        expenseSnapshot = structuredClone(persistedExpenses);
        return { rowsAffected: 0 };
      }
      if (query === "ROLLBACK") {
        persistedCategories.splice(0, persistedCategories.length, ...(categorySnapshot ?? []));
        persistedExpenses.splice(0, persistedExpenses.length, ...(expenseSnapshot ?? []));
        return { rowsAffected: 0 };
      }
      if (query === "COMMIT") return { rowsAffected: 0 };
      if (query.startsWith("INSERT INTO categories")) {
        const [id, name, , , , sort_order] = values as [
          string,
          string,
          string,
          string,
          null,
          number,
        ];
        persistedCategories.push({ id, name, sort_order });
        return { rowsAffected: 1 };
      }
      if (query.startsWith("INSERT INTO expenses")) {
        insertCount += 1;
        if (insertCount === options?.failOnInsert) throw new Error("constraint failed: secret fingerprint");
        const [id, category_id, description, amount_cents, date, nature, , import_fingerprint] = values as [
          string,
          string,
          string,
          number,
          string,
          MovementNature,
          string,
          string,
        ];
        if (persistedExpenses.some((expense) => expense.import_fingerprint === import_fingerprint)) {
          throw new Error("UNIQUE constraint failed: expenses.import_fingerprint");
        }
        persistedExpenses.push({ id, category_id, description, amount_cents, date, nature, status: "realizado", import_fingerprint });
        return { rowsAffected: 1 };
      }
      throw new Error(`Unexpected execute query: ${query}`);
    },
  };

  return { db, persistedCategories, persistedExpenses, selectCalls, executeCalls };
}

describe("statement import repository", () => {
  beforeEach(() => getDb.mockReset());

  it("queries reconciliation candidates only by parameterized date, amount and nature", async () => {
    const fake = createTransactionalFakeDb({
      expenses: [{
        id: "expense-1", category_id: "food", description: "Almoço", amount_cents: 1250,
        date: "2026-01-10", nature: "saida", status: "realizado", import_fingerprint: "old",
      }],
    });
    getDb.mockResolvedValue(fake.db);

    await expect(findReconciliationCandidates([statementRow()])).resolves.toEqual([
      expect.objectContaining({ id: "expense-1", description: "Almoço" }),
    ]);

    expect(fake.selectCalls).toHaveLength(1);
    expect(fake.selectCalls[0]?.query).toContain("e.date = $1");
    expect(fake.selectCalls[0]?.query).toContain("e.amount_cents = $2");
    expect(fake.selectCalls[0]?.query).toContain("e.nature = $3");
    expect(fake.selectCalls[0]?.query).not.toContain("description =");
    expect(fake.selectCalls[0]?.values).toEqual(["2026-01-10", 1250, "saida"]);
  });

  it("rolls back every approved line when a later expense insert fails", async () => {
    const fake = createTransactionalFakeDb({
      categories: [{ id: "food", name: "Alimentação", sort_order: 0 }],
      failOnInsert: 2,
    });
    getDb.mockResolvedValue(fake.db);

    await expect(confirmStatementImport([approved("first"), approved("second")])).rejects.toThrow(
      "Não foi possível confirmar a importação do extrato.",
    );

    expect(fake.persistedExpenses).toEqual([]);
    expect(fake.executeCalls.map(({ query }) => query)).toContain("BEGIN IMMEDIATE");
    expect(fake.executeCalls.map(({ query }) => query)).toContain("ROLLBACK");
    expect(fake.executeCalls.map(({ query }) => query)).not.toContain("COMMIT");
  });

  it("uses an existing category or explicitly creates a missing one with safe defaults", async () => {
    const fake = createTransactionalFakeDb({
      categories: [{ id: "food", name: "Alimentação", sort_order: 4 }],
    });
    getDb.mockResolvedValue(fake.db);

    const result = await confirmStatementImport([
      approved("existing"),
      approved("created", { category_id: "from-csv", createCategoryName: "  Mercado  " }),
    ]);

    expect(result).toEqual({ imported: 2 });
    expect(fake.persistedCategories).toContainEqual(expect.objectContaining({ name: "Mercado", sort_order: 5 }));
    const created = fake.persistedCategories.find(({ name }) => name === "Mercado");
    expect(fake.persistedExpenses).toEqual(expect.arrayContaining([
      expect.objectContaining({ category_id: "food", status: "realizado", import_fingerprint: "existing" }),
      expect.objectContaining({ category_id: created?.id, status: "realizado", import_fingerprint: "created" }),
    ]));
    const categoryInsert = fake.executeCalls.find(({ query }) => query.startsWith("INSERT INTO categories"));
    expect(categoryInsert?.values).toEqual([
      expect.any(String), "Mercado", "tag", "#6366F1", null, 5, expect.any(String),
    ]);
  });

  it("rejects repeated fingerprints without exposing SQLite details and leaves the import unchanged", async () => {
    const fake = createTransactionalFakeDb({
      categories: [{ id: "food", name: "Alimentação", sort_order: 0 }],
      expenses: [{
        id: "old", category_id: "food", description: "Já importada", amount_cents: 1250,
        date: "2026-01-10", nature: "saida", status: "realizado", import_fingerprint: "repeated",
      }],
    });
    getDb.mockResolvedValue(fake.db);

    await expect(confirmStatementImport([approved("repeated")])).rejects.toThrow(
      "Esta linha do extrato já foi importada.",
    );
    expect(fake.persistedExpenses).toHaveLength(1);
    expect(fake.executeCalls.map(({ query }) => query)).toContain("ROLLBACK");
  });

  it.each([
    [approved("bad", { amount_cents: 0 }), "Informe um valor válido maior que zero."],
    [approved("bad", { date: "2026-02-30" }), "Informe uma data válida."],
    [approved("  "), "Informe um identificador de importação válido."],
    [approved("bad", { createCategoryName: "  " }), "Informe uma categoria válida."],
  ])("validates %o without starting a transaction", async (line, message) => {
    const fake = createTransactionalFakeDb();
    getDb.mockResolvedValue(fake.db);

    await expect(confirmStatementImport([line])).rejects.toThrow(message);
    expect(getDb).not.toHaveBeenCalled();
    expect(fake.executeCalls).toHaveLength(0);
  });
});
