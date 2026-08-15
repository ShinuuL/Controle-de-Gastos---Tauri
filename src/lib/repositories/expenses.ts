import { getDb } from "../db";
import { monthRange } from "../date";
import type {
  CategoryTotal,
  CreateExpenseInput,
  Expense,
  ExpenseWithCategory,
} from "../types";

export async function listExpensesByMonth(
  year: number,
  month: number,
): Promise<ExpenseWithCategory[]> {
  const db = await getDb();
  const { start, end } = monthRange(year, month);
  const rows = await db.select<ExpenseWithCategory[]>(
    `SELECT e.*, c.name AS category_name, c.color AS category_color
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     WHERE e.date >= $1 AND e.date < $2
     ORDER BY e.date DESC, e.created_at DESC`,
    [start, end],
  );
  return rows;
}

export async function listAllExpenses(): Promise<ExpenseWithCategory[]> {
  const db = await getDb();
  return db.select<ExpenseWithCategory[]>(
    `SELECT e.*, c.name AS category_name, c.color AS category_color
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     ORDER BY e.date DESC, e.created_at DESC`,
  );
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO expenses (id, category_id, description, amount_cents, date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    [id, input.category_id, input.description, input.amount_cents, input.date, now],
  );
  return { id, ...input, created_at: now, updated_at: now };
}

export async function updateExpense(
  id: string,
  input: Partial<CreateExpenseInput>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.category_id !== undefined) {
    params.push(input.category_id);
    sets.push(`category_id = $${params.length}`);
  }
  if (input.description !== undefined) {
    params.push(input.description);
    sets.push(`description = $${params.length}`);
  }
  if (input.amount_cents !== undefined) {
    params.push(input.amount_cents);
    sets.push(`amount_cents = $${params.length}`);
  }
  if (input.date !== undefined) {
    params.push(input.date);
    sets.push(`date = $${params.length}`);
  }
  if (sets.length === 0) return;

  params.push(new Date().toISOString());
  sets.push(`updated_at = $${params.length}`);
  params.push(id);
  await db.execute(`UPDATE expenses SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM expenses WHERE id = $1", [id]);
}

export async function monthlyTotal(year: number, month: number): Promise<number> {
  const db = await getDb();
  const { start, end } = monthRange(year, month);
  const rows = await db.select<{ total: number | null }[]>(
    "SELECT SUM(amount_cents) AS total FROM expenses WHERE date >= $1 AND date < $2",
    [start, end],
  );
  return rows[0]?.total ?? 0;
}

export async function monthlyTotalsByCategory(
  year: number,
  month: number,
): Promise<CategoryTotal[]> {
  const db = await getDb();
  const { start, end } = monthRange(year, month);
  return db.select<CategoryTotal[]>(
    `SELECT e.category_id AS category_id,
            c.name AS category_name,
            c.color AS category_color,
            SUM(e.amount_cents) AS total_cents
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     WHERE e.date >= $1 AND e.date < $2
     GROUP BY e.category_id, c.name, c.color
     ORDER BY total_cents DESC`,
    [start, end],
  );
}
