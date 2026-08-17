import { getDb } from "../db";
import { monthRange } from "../date";
import { traceOperation } from "../observability/telemetry";
import type {
  CategoryTotal,
  CreateTransactionInput,
  Transaction,
  TransactionWithCategory,
  UpdateTransactionInput,
} from "../types";
import {
  validateAmount,
  validateCategoryId,
  validateDate,
  validateDescription,
  validateNature,
  validateStatus,
} from "./validation";

export async function listTransactionsByMonth(
  year: number,
  month: number,
): Promise<TransactionWithCategory[]> {
  return traceOperation("transaction.listMonth", async () => {
    const db = await getDb();
    const { start, end } = monthRange(year, month);
    return db.select<TransactionWithCategory[]>(
      `SELECT e.id, e.category_id, e.description, e.amount_cents, e.date,
              e.nature, e.status, e.created_at, e.updated_at,
              c.name AS category_name, c.color AS category_color
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.date >= $1 AND e.date < $2
       ORDER BY e.date DESC, e.created_at DESC`,
      [start, end],
    );
  });
}

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<Transaction> {
  return traceOperation("transaction.create", async () => {
    const description = validateDescription(input.description);
    const amount_cents = validateAmount(input.amount_cents);
    const date = validateDate(input.date);
    const nature = validateNature(input.nature);
    const status = validateStatus(input.status);
    const category_id = await validateCategoryId(input.category_id);
    const db = await getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO expenses (id, category_id, description, amount_cents, date, nature, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [id, category_id, description, amount_cents, date, nature, status, now],
    );
    return {
      id,
      category_id,
      description,
      amount_cents,
      date,
      nature,
      status,
      created_at: now,
      updated_at: now,
    };
  });
}

export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput,
): Promise<void> {
  return traceOperation("transaction.update", async () => {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.category_id !== undefined) {
      params.push(await validateCategoryId(input.category_id));
      sets.push(`category_id = $${params.length}`);
    }
    if (input.description !== undefined) {
      params.push(validateDescription(input.description));
      sets.push(`description = $${params.length}`);
    }
    if (input.amount_cents !== undefined) {
      params.push(validateAmount(input.amount_cents));
      sets.push(`amount_cents = $${params.length}`);
    }
    if (input.date !== undefined) {
      params.push(validateDate(input.date));
      sets.push(`date = $${params.length}`);
    }
    if (input.nature !== undefined) {
      params.push(validateNature(input.nature));
      sets.push(`nature = $${params.length}`);
    }
    if (input.status !== undefined) {
      params.push(validateStatus(input.status));
      sets.push(`status = $${params.length}`);
    }
    if (sets.length === 0) return;

    const db = await getDb();
    params.push(new Date().toISOString());
    sets.push(`updated_at = $${params.length}`);
    params.push(id);
    const result = await db.execute(
      `UPDATE expenses SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params,
    );
    if (result.rowsAffected !== 1) {
      throw new Error("Transação não encontrada.");
    }
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  return traceOperation("transaction.delete", async () => {
    const db = await getDb();
    const result = await db.execute("DELETE FROM expenses WHERE id = $1", [id]);
    if (result.rowsAffected !== 1) {
      throw new Error("Transação não encontrada.");
    }
  });
}

export async function monthlyTotal(year: number, month: number): Promise<number> {
  return traceOperation("transaction.monthlyTotal", async () => {
    const db = await getDb();
    const { start, end } = monthRange(year, month);
    const rows = await db.select<{ total: number | null }[]>(
      `SELECT SUM(CASE WHEN nature = 'entrada' THEN amount_cents ELSE -amount_cents END) AS total
       FROM expenses WHERE date >= $1 AND date < $2`,
      [start, end],
    );
    return rows[0]?.total ?? 0;
  });
}

export async function monthlyTotalsByCategory(
  year: number,
  month: number,
): Promise<CategoryTotal[]> {
  return traceOperation("transaction.monthlyTotalsByCategory", async () => {
    const db = await getDb();
    const { start, end } = monthRange(year, month);
    return db.select<CategoryTotal[]>(
      `SELECT e.category_id, c.name AS category_name, c.color AS category_color,
              SUM(CASE WHEN e.nature = 'entrada' THEN e.amount_cents ELSE -e.amount_cents END) AS total_cents
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.date >= $1 AND e.date < $2
       GROUP BY e.category_id, c.name, c.color`,
      [start, end],
    );
  });
}
