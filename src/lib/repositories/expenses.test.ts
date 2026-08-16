import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("../db", () => dbMock);

const { getDb } = dbMock;

import { createExpense, listExpensesByMonth, updateExpense } from "./expenses";

interface StoredExpense {
  id: string;
  category_id: string;
  description: string;
  amount_cents: number;
  date: string;
  created_at: string;
  updated_at: string;
}

function createFakeDb(categoryIds = ["food"]) {
  const expenses: StoredExpense[] = [];
  const selectCalls: Array<{ query: string; values?: unknown[] }> = [];
  const executeCalls: Array<{ query: string; values?: unknown[] }> = [];
  const db = {
    async select<T>(query: string, values?: unknown[]): Promise<T> {
      selectCalls.push({ query, values });
      if (query.includes("SELECT id FROM categories")) {
        return categoryIds
          .filter((id) => id === values?.[0])
          .map((id) => ({ id })) as T;
      }
      throw new Error("Unexpected select query");
    },
    async execute(query: string, values?: unknown[]) {
      executeCalls.push({ query, values });
      if (query.startsWith("INSERT INTO expenses")) {
        const [id, category_id, description, amount_cents, date, created_at] =
          values as [string, string, string, number, string, string];
        expenses.push({
          id,
          category_id,
          description,
          amount_cents,
          date,
          created_at,
          updated_at: created_at,
        });
      }
      return { rowsAffected: 1 };
    },
  };
  return { db, expenses, selectCalls, executeCalls };
}

describe("expense repository", () => {
  beforeEach(() => getDb.mockReset());

  it.each([
    {
      description: "x".repeat(501),
      category_id: "food",
      amount_cents: 1,
      date: "2026-01-01",
    },
    {
      description: "ok",
      category_id: " ",
      amount_cents: 1,
      date: "2026-01-01",
    },
    {
      description: "ok",
      category_id: "food",
      amount_cents: 0,
      date: "2026-01-01",
    },
    {
      description: "ok",
      category_id: "food",
      amount_cents: -1,
      date: "2026-01-01",
    },
    {
      description: "ok",
      category_id: "food",
      amount_cents: 1.5,
      date: "2026-01-01",
    },
    {
      description: "ok",
      category_id: "food",
      amount_cents: Number.MAX_SAFE_INTEGER + 1,
      date: "2026-01-01",
    },
    {
      description: "ok",
      category_id: "food",
      amount_cents: 1,
      date: "2026-1-01",
    },
    {
      description: "ok",
      category_id: "food",
      amount_cents: 1,
      date: "2026-02-30",
    },
  ])("rejects invalid creation input before persistence", async (input) => {
    const fake = createFakeDb();
    getDb.mockResolvedValue(fake.db);

    await expect(createExpense(input)).rejects.toThrow();
    expect(fake.executeCalls).toHaveLength(0);
  });

  it("rejects an unknown category with a safe Portuguese error", async () => {
    const fake = createFakeDb();
    getDb.mockResolvedValue(fake.db);

    await expect(
      createExpense({
        description: "ok",
        category_id: "missing",
        amount_cents: 1,
        date: "2026-01-01",
      }),
    ).rejects.toThrow("Categoria não encontrada.");
    expect(fake.executeCalls).toHaveLength(0);
  });

  it("rejects malformed runtime text values with Portuguese errors", async () => {
    const fake = createFakeDb();
    getDb.mockResolvedValue(fake.db);

    await expect(
      createExpense({
        description: null as unknown as string,
        category_id: "food",
        amount_cents: 1,
        date: "2026-01-01",
      }),
    ).rejects.toThrow("Informe uma descrição válida.");
    await expect(
      createExpense({
        description: "ok",
        category_id: null as unknown as string,
        amount_cents: 1,
        date: "2026-01-01",
      }),
    ).rejects.toThrow("Informe uma categoria válida.");
  });

  it("trims and persists valid input", async () => {
    const fake = createFakeDb(["food"]);
    getDb.mockResolvedValue(fake.db);

    const expense = await createExpense({
      description: "  almoço  ",
      category_id: " food ",
      amount_cents: 1250,
      date: "2026-01-01",
    });

    expect(expense).toMatchObject({
      description: "almoço",
      category_id: "food",
    });
    expect(fake.expenses).toContainEqual(
      expect.objectContaining({ description: "almoço", category_id: "food" }),
    );
  });

  it("accepts an empty description after trimming", async () => {
    const fake = createFakeDb(["food"]);
    getDb.mockResolvedValue(fake.db);

    const expense = await createExpense({
      description: "   ",
      category_id: "food",
      amount_cents: 1250,
      date: "2026-01-01",
    });

    expect(expense.description).toBe("");
    expect(fake.expenses).toContainEqual(
      expect.objectContaining({ description: "" }),
    );
  });

  it("lists only realized outflows for the legacy expense screen", async () => {
    const select = vi.fn().mockResolvedValue([]);
    getDb.mockResolvedValue({ select });

    await listExpensesByMonth(2026, 1);

    expect(select.mock.calls[0]?.[0]).toContain("e.nature = 'saida'");
    expect(select.mock.calls[0]?.[0]).toContain("e.status = 'realizado'");
  });

  it("validates only supplied update fields", async () => {
    const fake = createFakeDb(["food"]);
    getDb.mockResolvedValue(fake.db);

    await expect(
      updateExpense("expense", { amount_cents: 0 }),
    ).rejects.toThrow();
    await expect(
      updateExpense("expense", { date: "2026-02-30" }),
    ).rejects.toThrow();
    await expect(
      updateExpense("expense", { category_id: "missing" }),
    ).rejects.toThrow("Categoria não encontrada.");
    await expect(
      updateExpense("expense", { description: "  ok  " }),
    ).resolves.toBeUndefined();
    expect(fake.executeCalls[fake.executeCalls.length - 1]?.values).toContain(
      "ok",
    );
  });
});
