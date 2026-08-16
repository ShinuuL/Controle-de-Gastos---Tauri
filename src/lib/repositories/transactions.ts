import { getDb } from "../db";
import { monthRange } from "../date";
import type { Transaction } from "../types";

export async function listTransactionsByMonth(
  year: number,
  month: number,
): Promise<Transaction[]> {
  const db = await getDb();
  const { start, end } = monthRange(year, month);
  return db.select<Transaction[]>(
    `SELECT id, category_id, description, amount_cents, date, nature, status,
            created_at, updated_at
     FROM expenses
     WHERE date >= $1 AND date < $2
     ORDER BY date DESC, created_at DESC`,
    [start, end],
  );
}
