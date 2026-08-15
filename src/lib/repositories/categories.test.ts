import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../types";

const dbMock = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("../db", () => dbMock);

const { getDb } = dbMock;

import {
  createCategory,
  deleteCategory,
  listCategoryBudgetProgress,
  updateCategoryBudget,
} from "./categories";

type StoredCategory = Omit<Category, "is_preset"> & { is_preset: number };

function createFakeDb(options?: {
  categories?: StoredCategory[];
  expenseCategoryIds?: string[];
  budgetProgressRows?: Array<StoredCategory & { spent_cents: number }>;
}) {
  const categories = [...(options?.categories ?? [])];
  const expenseCategoryIds = [...(options?.expenseCategoryIds ?? [])];
  const budgetProgressRows = [...(options?.budgetProgressRows ?? [])];
  const selectCalls: Array<{ query: string; values?: unknown[] }> = [];
  const executeCalls: Array<{ query: string; values?: unknown[] }> = [];

  const db = {
    async select<T>(query: string, values?: unknown[]): Promise<T> {
      selectCalls.push({ query, values });

      if (query.includes("MAX(sort_order)")) {
        return [
          {
            max: Math.max(
              -1,
              ...categories.map(({ sort_order }) => sort_order),
            ),
          },
        ] as T;
      }
      if (query.includes("COALESCE(SUM")) return budgetProgressRows as T;
      if (query.includes("SELECT is_preset")) {
        return categories
          .filter(({ id }) => id === values?.[0])
          .map(({ is_preset }) => ({ is_preset })) as T;
      }
      if (query.includes("COUNT(*) AS n")) {
        return [
          { n: expenseCategoryIds.filter((id) => id === values?.[0]).length },
        ] as T;
      }

      throw new Error(`Unexpected select query: ${query}`);
    },
    async execute(query: string, values?: unknown[]) {
      executeCalls.push({ query, values });

      if (query.startsWith("INSERT INTO categories")) {
        const [id, name, icon, color, budget_monthly, sort_order, created_at] =
          values as [
            string,
            string,
            string,
            string,
            number | null,
            number,
            string,
          ];
        categories.push({
          id,
          name,
          icon,
          color,
          is_preset: 0,
          budget_monthly,
          sort_order,
          created_at,
        });
        return { rowsAffected: 1 };
      }
      if (query.startsWith("UPDATE categories")) {
        const [budgetMonthly, id] = values as [number | null, string];
        const category = categories.find((entry) => entry.id === id);
        if (!category) return { rowsAffected: 0 };
        category.budget_monthly = budgetMonthly;
        return { rowsAffected: 1 };
      }
      if (query.startsWith("DELETE FROM categories")) {
        const id = values?.[0] as string;
        const index = categories.findIndex((entry) => entry.id === id);
        if (index === -1) return { rowsAffected: 0 };
        categories.splice(index, 1);
        return { rowsAffected: 1 };
      }

      throw new Error(`Unexpected execute query: ${query}`);
    },
  };

  return { categories, db, executeCalls, selectCalls };
}

describe("category repository", () => {
  beforeEach(() => {
    getDb.mockReset();
  });

  it.each([
    { name: "   ", icon: "Wallet", color: "#123456" },
    { name: "Mercado", icon: "   ", color: "#123456" },
    { name: "Mercado", icon: "Wallet", color: "123456" },
    { name: "Mercado", icon: "Wallet", color: "#12345" },
    { name: "Mercado", icon: "Wallet", color: "#ABCDEG" },
  ])(
    "rejects malformed category creation input before accessing the database",
    async (input) => {
      const fake = createFakeDb();
      getDb.mockResolvedValue(fake.db);

      await expect(createCategory(input)).rejects.toThrow();

      expect(getDb).not.toHaveBeenCalled();
      expect(fake.selectCalls).toHaveLength(0);
      expect(fake.executeCalls).toHaveLength(0);
    },
  );

  it("trims valid category values before returning and persisting them", async () => {
    const fake = createFakeDb();
    getDb.mockResolvedValue(fake.db);

    const category = await createCategory({
      name: "  Mercado  ",
      icon: "  ShoppingCart  ",
      color: "#aBc123",
      budget_monthly: 25_000,
    });

    expect(category).toMatchObject({
      name: "Mercado",
      icon: "ShoppingCart",
      color: "#aBc123",
      budget_monthly: 25_000,
    });
    expect(fake.categories).toContainEqual({ ...category, is_preset: 0 });
  });

  it.each(["", "   ", "missing-category"])(
    "rejects an empty or unknown budget category ID with a not-found error",
    async (id) => {
      const fake = createFakeDb();
      getDb.mockResolvedValue(fake.db);

      await expect(updateCategoryBudget(id, 12_000)).rejects.toThrow(
        "Categoria não encontrada.",
      );

      if (id.trim()) expect(fake.executeCalls).toHaveLength(1);
      else expect(getDb).not.toHaveBeenCalled();
    },
  );

  it("persists a valid budget update in the fake database", async () => {
    const fake = createFakeDb({
      categories: [
        {
          id: "food",
          name: "Alimentação",
          icon: "Utensils",
          color: "#123456",
          is_preset: 0,
          budget_monthly: null,
          sort_order: 0,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    getDb.mockResolvedValue(fake.db);

    await expect(
      updateCategoryBudget(" food ", 12_000),
    ).resolves.toBeUndefined();

    expect(fake.categories).toContainEqual(
      expect.objectContaining({ id: "food", budget_monthly: 12_000 }),
    );
  });

  it("rejects a blank deletion ID before accessing the database", async () => {
    const fake = createFakeDb();
    getDb.mockResolvedValue(fake.db);

    await expect(deleteCategory("   ")).rejects.toThrow(
      "Categoria não encontrada.",
    );

    expect(getDb).not.toHaveBeenCalled();
    expect(fake.selectCalls).toHaveLength(0);
    expect(fake.executeCalls).toHaveLength(0);
  });

  it("rejects an unknown deletion ID before checking expenses", async () => {
    const fake = createFakeDb();
    getDb.mockResolvedValue(fake.db);

    await expect(deleteCategory("missing-category")).rejects.toThrow(
      "Categoria não encontrada.",
    );

    expect(fake.selectCalls).toHaveLength(1);
    expect(fake.executeCalls).toHaveLength(0);
  });

  it("rejects preset deletion before checking its expenses", async () => {
    const fake = createFakeDb({
      categories: [
        {
          id: "preset",
          name: "Moradia",
          icon: "House",
          color: "#123456",
          is_preset: 1,
          budget_monthly: null,
          sort_order: 0,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      expenseCategoryIds: ["preset"],
    });
    getDb.mockResolvedValue(fake.db);

    await expect(deleteCategory(" preset ")).rejects.toThrow(
      "Categorias padrão não podem ser excluídas.",
    );

    expect(fake.selectCalls).toHaveLength(1);
    expect(fake.executeCalls).toHaveLength(0);
  });

  it("preserves the expense-linked category deletion error", async () => {
    const fake = createFakeDb({
      categories: [
        {
          id: "food",
          name: "Alimentação",
          icon: "Utensils",
          color: "#123456",
          is_preset: 0,
          budget_monthly: null,
          sort_order: 0,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      expenseCategoryIds: ["food"],
    });
    getDb.mockResolvedValue(fake.db);

    await expect(deleteCategory(" food ")).rejects.toThrow(
      "Categoria possui gastos e não pode ser excluída.",
    );

    expect(fake.executeCalls).toHaveLength(0);
  });

  it("removes a custom category with no expenses from the fake database", async () => {
    const fake = createFakeDb({
      categories: [
        {
          id: "leisure",
          name: "Lazer",
          icon: "Gamepad2",
          color: "#654321",
          is_preset: 0,
          budget_monthly: null,
          sort_order: 1,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    getDb.mockResolvedValue(fake.db);

    await expect(deleteCategory(" leisure ")).resolves.toBeUndefined();

    expect(fake.categories).not.toContainEqual(
      expect.objectContaining({ id: "leisure" }),
    );
  });

  it("retains a zero-spend category and maps its preset flag", async () => {
    const fake = createFakeDb({
      budgetProgressRows: [
        {
          id: "zero-spend",
          name: "Educação",
          icon: "BookOpen",
          color: "#654321",
          is_preset: 0,
          budget_monthly: 10_000,
          sort_order: 2,
          created_at: "2026-01-01T00:00:00.000Z",
          spent_cents: 0,
        },
        {
          id: "preset",
          name: "Moradia",
          icon: "House",
          color: "#123456",
          is_preset: 1,
          budget_monthly: null,
          sort_order: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          spent_cents: 3_000,
        },
      ],
    });
    getDb.mockResolvedValue(fake.db);

    const categories = await listCategoryBudgetProgress(2026, 1);

    expect(categories).toEqual([
      expect.objectContaining({
        id: "zero-spend",
        is_preset: false,
        spent_cents: 0,
      }),
      expect.objectContaining({
        id: "preset",
        is_preset: true,
        spent_cents: 3_000,
      }),
    ]);
  });
});
