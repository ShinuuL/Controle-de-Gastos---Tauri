import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CategoryTotal,
  CreateTransactionInput,
  MovementNature,
  MovementStatus,
} from "../types";

const dbMock = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("../db", () => dbMock);

const { getDb } = dbMock;

import {
  createTransaction,
  deleteTransaction,
  listTransactionsByMonth,
  monthlyTotal,
  monthlyTotalsByCategory,
  updateTransaction,
} from "./transactions";

const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface StoredTransaction {
  id: string;
  category_id: string;
  description: string;
  amount_cents: number;
  date: string;
  nature: MovementNature;
  status: MovementStatus;
  created_at: string;
  updated_at: string;
}

interface TransactionWithCategoryRow extends StoredTransaction {
  category_name: string;
  category_color: string;
}

function transactionInput(
  overrides: Partial<CreateTransactionInput> = {},
): CreateTransactionInput {
  return {
    category_id: "food",
    description: "almoço",
    amount_cents: 1250,
    date: "2026-01-10",
    nature: "saida",
    status: "realizado",
    ...overrides,
  };
}

function storedTransaction(
  overrides: Partial<StoredTransaction> = {},
): StoredTransaction {
  return {
    id: "tx-1",
    category_id: "food",
    description: "almoço",
    amount_cents: 1250,
    date: "2026-01-10",
    nature: "saida",
    status: "realizado",
    created_at: "2026-01-10T12:00:00.000Z",
    updated_at: "2026-01-10T12:00:00.000Z",
    ...overrides,
  };
}

function createFakeDb(options?: {
  categoryIds?: string[];
  transactions?: StoredTransaction[];
  transactionRows?: TransactionWithCategoryRow[];
  monthlyTotalResult?: Array<{ total: number | null }>;
}) {
  const transactions = [...(options?.transactions ?? [])];
  const transactionRows = options?.transactionRows ?? [];
  const categoryIds = options?.categoryIds ?? [];
  const monthlyTotalResult = options?.monthlyTotalResult ?? [];
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
      if (query.includes("JOIN categories")) return transactionRows as T;
      if (query.includes("SUM(CASE")) return monthlyTotalResult as T;
      throw new Error("Unexpected select query");
    },
    async execute(query: string, values?: unknown[]) {
      executeCalls.push({ query, values });
      if (query.startsWith("INSERT INTO expenses")) {
        const [
          id,
          category_id,
          description,
          amount_cents,
          date,
          nature,
          status,
          created_at,
        ] = values as [
          string,
          string,
          string,
          number,
          string,
          MovementNature,
          MovementStatus,
          string,
        ];
        transactions.push({
          id,
          category_id,
          description,
          amount_cents,
          date,
          nature,
          status,
          created_at,
          updated_at: created_at,
        });
        return { rowsAffected: 1 };
      }
      if (query.startsWith("UPDATE expenses")) {
        const id = values?.[values.length - 1] as string;
        const entry = transactions.find((item) => item.id === id);
        if (!entry) return { rowsAffected: 0 };
        const assignments = (query.match(/SET (.+?) WHERE/) ?? [])[1]
          .split(",")
          .map((part) => part.trim());
        for (const assignment of assignments) {
          const [column, placeholder] = assignment.split(" = ");
          const index = Number(placeholder.slice(1)) - 1;
          (entry as unknown as Record<string, unknown>)[column] =
            values?.[index];
        }
        return { rowsAffected: 1 };
      }
      if (query.startsWith("DELETE FROM expenses")) {
        const id = values?.[0] as string;
        const index = transactions.findIndex((item) => item.id === id);
        if (index === -1) return { rowsAffected: 0 };
        transactions.splice(index, 1);
        return { rowsAffected: 1 };
      }
      throw new Error("Unexpected execute query");
    },
  };

  return { db, transactions, selectCalls, executeCalls };
}

describe("transaction repository", () => {
  beforeEach(() => getDb.mockReset());

  describe("listTransactionsByMonth", () => {
    it("joins category details and returns the transaction rows", async () => {
      const rows: TransactionWithCategoryRow[] = [
        {
          id: "tx-1",
          category_id: "food",
          description: "almoço",
          amount_cents: 1250,
          date: "2026-01-10",
          nature: "saida",
          status: "realizado",
          created_at: "2026-01-10T12:00:00.000Z",
          updated_at: "2026-01-10T12:00:00.000Z",
          category_name: "Alimentação",
          category_color: "#123456",
        },
      ];
      const fake = createFakeDb({ transactionRows: rows });
      getDb.mockResolvedValue(fake.db);

      const result = await listTransactionsByMonth(2026, 1);

      expect(result).toEqual(rows);
      const query = fake.selectCalls[0]?.query ?? "";
      expect(query).toContain("JOIN categories");
      expect(query).toContain("c.name AS category_name");
      expect(query).toContain("c.color AS category_color");
      expect(query).toContain("ORDER BY e.date DESC, e.created_at DESC");
      expect(fake.selectCalls[0]?.values).toEqual(["2026-01-01", "2026-02-01"]);
    });
  });

  describe("createTransaction", () => {
    it.each([
      {
        label: "a non-text description",
        input: transactionInput({
          description: null as unknown as string,
        }),
        message: "Informe uma descrição válida.",
      },
      {
        label: "an overlong description",
        input: transactionInput({ description: "x".repeat(501) }),
        message: "A descrição deve ter no máximo 500 caracteres.",
      },
      {
        label: "a zero amount",
        input: transactionInput({ amount_cents: 0 }),
        message: "Informe um valor válido maior que zero.",
      },
      {
        label: "a negative amount",
        input: transactionInput({ amount_cents: -1 }),
        message: "Informe um valor válido maior que zero.",
      },
      {
        label: "a fractional amount",
        input: transactionInput({ amount_cents: 1.5 }),
        message: "Informe um valor válido maior que zero.",
      },
      {
        label: "a non-safe-integer amount",
        input: transactionInput({
          amount_cents: Number.MAX_SAFE_INTEGER + 1,
        }),
        message: "Informe um valor válido maior que zero.",
      },
      {
        label: "a non-text date",
        input: transactionInput({ date: null as unknown as string }),
        message: "Informe uma data válida.",
      },
      {
        label: "a malformed date",
        input: transactionInput({ date: "2026-1-01" }),
        message: "Informe uma data válida.",
      },
      {
        label: "an impossible calendar date",
        input: transactionInput({ date: "2026-02-30" }),
        message: "Informe uma data válida.",
      },
      {
        label: "an invalid nature",
        input: transactionInput({
          nature: "invalida" as unknown as MovementNature,
        }),
        message: "Informe uma natureza válida.",
      },
      {
        label: "an invalid status",
        input: transactionInput({
          status: "invalido" as unknown as MovementStatus,
        }),
        message: "Informe um status válido.",
      },
    ])(
      "rejects $label before touching the database",
      async ({ input, message }) => {
        const fake = createFakeDb({ categoryIds: ["food"] });
        getDb.mockResolvedValue(fake.db);

        await expect(createTransaction(input)).rejects.toThrow(message);

        expect(getDb).not.toHaveBeenCalled();
        expect(fake.executeCalls).toHaveLength(0);
      },
    );

    it("validates fields in the documented order", async () => {
      const fake = createFakeDb();
      getDb.mockResolvedValue(fake.db);

      await expect(
        createTransaction(
          transactionInput({
            description: null as unknown as string,
            amount_cents: 0,
          }),
        ),
      ).rejects.toThrow("Informe uma descrição válida.");
      await expect(
        createTransaction(
          transactionInput({
            amount_cents: 0,
            date: "2026-02-30",
          }),
        ),
      ).rejects.toThrow("Informe um valor válido maior que zero.");
      await expect(
        createTransaction(
          transactionInput({
            date: "2026-02-30",
            nature: "invalida" as unknown as MovementNature,
          }),
        ),
      ).rejects.toThrow("Informe uma data válida.");
      await expect(
        createTransaction(
          transactionInput({
            nature: "invalida" as unknown as MovementNature,
            status: "invalido" as unknown as MovementStatus,
          }),
        ),
      ).rejects.toThrow("Informe uma natureza válida.");
      await expect(
        createTransaction(
          transactionInput({
            status: "invalido" as unknown as MovementStatus,
            category_id: "missing",
          }),
        ),
      ).rejects.toThrow("Informe um status válido.");
    });

    it("rejects an unknown category with a safe Portuguese error", async () => {
      const fake = createFakeDb({ categoryIds: ["food"] });
      getDb.mockResolvedValue(fake.db);

      await expect(
        createTransaction(transactionInput({ category_id: "missing" })),
      ).rejects.toThrow("Categoria não encontrada.");

      expect(fake.selectCalls[0]?.query).toContain(
        "SELECT id FROM categories WHERE id = $1",
      );
      expect(fake.selectCalls[0]?.values).toEqual(["missing"]);
      expect(fake.executeCalls).toHaveLength(0);
    });

    it("trims, validates and persists a new transaction with a UUID and timestamps", async () => {
      const fake = createFakeDb({ categoryIds: ["food"] });
      getDb.mockResolvedValue(fake.db);

      const transaction = await createTransaction(
        transactionInput({
          description: "  almoço  ",
          category_id: " food ",
        }),
      );

      expect(transaction).toMatchObject({
        id: expect.stringMatching(UUID_RE),
        category_id: "food",
        description: "almoço",
        amount_cents: 1250,
        date: "2026-01-10",
        nature: "saida",
        status: "realizado",
        created_at: expect.stringMatching(ISO_DATE_TIME_RE),
        updated_at: expect.stringMatching(ISO_DATE_TIME_RE),
      });
      expect(transaction.created_at).toBe(transaction.updated_at);

      expect(fake.executeCalls).toHaveLength(1);
      const call = fake.executeCalls[0];
      expect(call?.query).toContain("INSERT INTO expenses");
      expect(call?.query).toContain(
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)",
      );
      expect(call?.values).toHaveLength(8);
      expect(call?.values?.[0]).toBe(transaction.id);
      expect(call?.values?.[7]).toBe(transaction.created_at);
      expect(fake.transactions).toContainEqual({ ...transaction });
    });

    it("accepts an empty description after trimming", async () => {
      const fake = createFakeDb({ categoryIds: ["food"] });
      getDb.mockResolvedValue(fake.db);

      const transaction = await createTransaction(
        transactionInput({ description: "   " }),
      );

      expect(transaction.description).toBe("");
      expect(fake.transactions).toContainEqual(
        expect.objectContaining({ description: "" }),
      );
    });
  });

  describe("updateTransaction", () => {
    it("validates only the supplied fields and builds a dynamic SET clause", async () => {
      const fake = createFakeDb({
        categoryIds: ["food"],
        transactions: [storedTransaction()],
      });
      getDb.mockResolvedValue(fake.db);

      await expect(
        updateTransaction("tx-1", { amount_cents: 0 }),
      ).rejects.toThrow("Informe um valor válido maior que zero.");
      await expect(
        updateTransaction("tx-1", { date: "2026-02-30" }),
      ).rejects.toThrow("Informe uma data válida.");
      await expect(
        updateTransaction("tx-1", { category_id: "missing" }),
      ).rejects.toThrow("Categoria não encontrada.");

      const executedBefore = fake.executeCalls.length;
      await expect(
        updateTransaction("tx-1", {
          description: "  novo  ",
          amount_cents: 500,
        }),
      ).resolves.toBeUndefined();

      const call = fake.executeCalls[executedBefore];
      expect(call?.query).toContain("description = $1");
      expect(call?.query).toContain("amount_cents = $2");
      expect(call?.query).toContain("updated_at = $3");
      expect(call?.query).toContain("WHERE id = $4");
      expect(call?.values).toEqual([
        "novo",
        500,
        expect.stringMatching(ISO_DATE_TIME_RE),
        "tx-1",
      ]);
      expect(fake.transactions[0]).toMatchObject({
        description: "novo",
        amount_cents: 500,
        updated_at: call?.values?.[2],
      });
    });

    it("applies a supplied nature and status to the dynamic SET clause", async () => {
      const fake = createFakeDb({
        transactions: [storedTransaction()],
      });
      getDb.mockResolvedValue(fake.db);

      await updateTransaction("tx-1", {
        nature: "entrada",
        status: "previsto",
      });

      const call = fake.executeCalls[0];
      expect(call?.query).toContain("nature = $1");
      expect(call?.query).toContain("status = $2");
      expect(call?.query).toContain("updated_at = $3");
      expect(call?.values).toEqual([
        "entrada",
        "previsto",
        expect.stringMatching(ISO_DATE_TIME_RE),
        "tx-1",
      ]);
      expect(fake.transactions[0]).toMatchObject({
        nature: "entrada",
        status: "previsto",
      });
    });

    it("throws a not-found error when the transaction does not exist", async () => {
      const fake = createFakeDb();
      getDb.mockResolvedValue(fake.db);

      await expect(
        updateTransaction("missing", { description: "x" }),
      ).rejects.toThrow("Transação não encontrada.");
    });

    it("does not touch the database when no field is supplied", async () => {
      const fake = createFakeDb();
      getDb.mockResolvedValue(fake.db);

      await expect(updateTransaction("tx-1", {})).resolves.toBeUndefined();

      expect(fake.executeCalls).toHaveLength(0);
    });
  });

  describe("deleteTransaction", () => {
    it("removes an existing transaction from the database", async () => {
      const fake = createFakeDb({
        transactions: [storedTransaction()],
      });
      getDb.mockResolvedValue(fake.db);

      await expect(deleteTransaction("tx-1")).resolves.toBeUndefined();

      expect(fake.executeCalls).toHaveLength(1);
      expect(fake.executeCalls[0]?.query).toContain(
        "DELETE FROM expenses WHERE id = $1",
      );
      expect(fake.executeCalls[0]?.values).toEqual(["tx-1"]);
      expect(fake.transactions).not.toContainEqual(
        expect.objectContaining({ id: "tx-1" }),
      );
    });

    it("throws a not-found error when the transaction does not exist", async () => {
      const fake = createFakeDb();
      getDb.mockResolvedValue(fake.db);

      await expect(deleteTransaction("missing")).rejects.toThrow(
        "Transação não encontrada.",
      );
    });
  });

  describe("monthlyTotal", () => {
    it("uses a signed CASE WHEN to sum entradas positively and saidas negatively", async () => {
      const fake = createFakeDb({ monthlyTotalResult: [{ total: 5000 }] });
      getDb.mockResolvedValue(fake.db);

      const result = await monthlyTotal(2026, 1);

      expect(result).toBe(5000);
      const query = fake.selectCalls[0]?.query ?? "";
      expect(query).toContain(
        "CASE WHEN nature = 'entrada' THEN amount_cents ELSE -amount_cents END",
      );
      expect(query).not.toContain("nature = 'saida'");
      expect(fake.selectCalls[0]?.values).toEqual([
        "2026-01-01",
        "2026-02-01",
      ]);
    });

    it("returns 0 when there are no rows", async () => {
      const fake = createFakeDb({ monthlyTotalResult: [] });
      getDb.mockResolvedValue(fake.db);

      const result = await monthlyTotal(2026, 3);

      expect(result).toBe(0);
      expect(fake.selectCalls[0]?.values).toEqual([
        "2026-03-01",
        "2026-04-01",
      ]);
    });

    it("returns 0 when the total is null", async () => {
      const fake = createFakeDb({ monthlyTotalResult: [{ total: null }] });
      getDb.mockResolvedValue(fake.db);

      const result = await monthlyTotal(2026, 1);

      expect(result).toBe(0);
    });
  });

  describe("monthlyTotalsByCategory", () => {
    it("uses a signed CASE WHEN, joins categories, and groups by category", async () => {
      const categoryTotals: CategoryTotal[] = [
        {
          category_id: "food",
          category_name: "Alimentação",
          category_color: "#123456",
          total_cents: 3000,
        },
        {
          category_id: "transport",
          category_name: "Transporte",
          category_color: "#654321",
          total_cents: -500,
        },
      ];
      const fake = createFakeDb({
        transactionRows:
          categoryTotals as unknown as TransactionWithCategoryRow[],
      });
      getDb.mockResolvedValue(fake.db);

      const result = await monthlyTotalsByCategory(2026, 1);

      expect(result).toEqual(categoryTotals);
      const query = fake.selectCalls[0]?.query ?? "";
      expect(query).toContain(
        "CASE WHEN e.nature = 'entrada' THEN e.amount_cents ELSE -e.amount_cents END",
      );
      expect(query).not.toContain("nature = 'saida'");
      expect(query).toContain("GROUP BY");
      expect(fake.selectCalls[0]?.values).toEqual([
        "2026-01-01",
        "2026-02-01",
      ]);
    });

    it("returns an empty array when no categories have transactions", async () => {
      const fake = createFakeDb({ transactionRows: [] });
      getDb.mockResolvedValue(fake.db);

      const result = await monthlyTotalsByCategory(2026, 3);

      expect(result).toEqual([]);
      expect(fake.selectCalls[0]?.query).toContain("GROUP BY");
      expect(fake.selectCalls[0]?.values).toEqual([
        "2026-03-01",
        "2026-04-01",
      ]);
    });
  });
});
