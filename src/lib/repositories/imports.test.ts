import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovedImportLine } from "../types";

const dbMock = vi.hoisted(() => ({ getDb: vi.fn() }));
const tauriMock = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("../db", () => dbMock);
vi.mock("@tauri-apps/api/core", () => tauriMock);

const { getDb } = dbMock;
const { invoke } = tauriMock;

import {
  confirmStatementImport,
  findReconciliationCandidates,
} from "./imports";

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

function createCandidateFakeDb() {
  const selectCalls: Array<{ query: string; values?: unknown[] }> = [];
  const db = {
    async select<T>(query: string, values?: unknown[]): Promise<T> {
      selectCalls.push({ query, values });
      return [
        {
          id: "expense-1",
          date: "2026-01-10",
          description: "Almoço",
          amount_cents: 1250,
          nature: "saida",
        },
      ] as T;
    },
  };
  return { db, selectCalls };
}

describe("statement import repository", () => {
  beforeEach(() => {
    getDb.mockReset();
    invoke.mockReset();
  });

  it("queries reconciliation candidates only by parameterized date, amount and nature", async () => {
    const fake = createCandidateFakeDb();
    getDb.mockResolvedValue(fake.db);

    await expect(
      findReconciliationCandidates([
        {
          date: "2026-01-10",
          amount_cents: 1250,
          nature: "saida",
        },
      ]),
    ).resolves.toEqual([
      expect.objectContaining({ id: "expense-1", description: "Almoço" }),
    ]);

    expect(fake.selectCalls).toHaveLength(1);
    expect(fake.selectCalls[0]?.query).toContain("e.date = $1");
    expect(fake.selectCalls[0]?.query).toContain("e.amount_cents = $2");
    expect(fake.selectCalls[0]?.query).toContain("e.nature = $3");
    expect(fake.selectCalls[0]?.query).not.toContain("description =");
    expect(fake.selectCalls[0]?.values).toEqual([
      "2026-01-10",
      1250,
      "saida",
    ]);
  });

  it("delegates confirmation atomically to the typed Tauri command", async () => {
    const lines = [approved("first"), approved("second")];
    invoke.mockResolvedValue({ imported: 2 });

    await expect(confirmStatementImport(lines)).resolves.toEqual({ imported: 2 });

    expect(invoke).toHaveBeenCalledWith("confirm_statement_import", {
      lines,
    });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("preserves the safe command error without accessing frontend SQL", async () => {
    invoke.mockRejectedValue(
      new Error("Esta linha do extrato já foi importada."),
    );

    await expect(confirmStatementImport([approved("repeated")])).rejects.toThrow(
      "Esta linha do extrato já foi importada.",
    );
    expect(getDb).not.toHaveBeenCalled();
  });
});
