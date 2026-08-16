import { describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
  db: { select: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../db", () => ({ getDb: vi.fn().mockResolvedValue(db) }));

import { listTransactionsByMonth } from "./transactions";

describe("listTransactionsByMonth", () => {
  it("queries the configured database with a monthly parameterized range", async () => {
    await listTransactionsByMonth(2026, 1);
    expect(db.select).toHaveBeenCalledWith(expect.any(String), ["2026-01-01", "2026-02-01"]);
  });
});
