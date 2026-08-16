import { getDb } from "../db";
import { monthRange } from "../date";
import { traceOperation } from "../observability/telemetry";
import type {
  CategoryTotal,
  CreateExpenseInput,
  Expense,
  ExpenseWithCategory,
} from "../types";

function validateDescription(description: string): string {
  if (typeof description !== "string") {
    throw new Error("Informe uma descrição válida.");
  }
  const value = description.trim();
  if (value.length > 500)
    throw new Error("A descrição deve ter no máximo 500 caracteres.");
  return value;
}

function validateAmount(amountCents: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error("Informe um valor válido maior que zero.");
  }
  return amountCents;
}

function validateDate(date: string): string {
  if (typeof date !== "string") throw new Error("Informe uma data válida.");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Informe uma data válida.");
  const [year, month, day] = match.slice(1).map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new Error("Informe uma data válida.");
  }
  return date;
}

async function validateCategoryId(categoryId: string): Promise<string> {
  if (typeof categoryId !== "string") {
    throw new Error("Informe uma categoria válida.");
  }
  const value = categoryId.trim();
  if (!value) throw new Error("Informe uma categoria válida.");
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    "SELECT id FROM categories WHERE id = $1",
    [value],
  );
  if (!rows[0]) throw new Error("Categoria não encontrada.");
  return value;
}

export async function listExpensesByMonth(
  year: number,
  month: number,
): Promise<ExpenseWithCategory[]> {
  return traceOperation("expense.listMonth", async () => {
    const db = await getDb();
    const { start, end } = monthRange(year, month);
    return db.select<ExpenseWithCategory[]>(
      `SELECT e.*, c.name AS category_name, c.color AS category_color
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
      WHERE e.date >= $1 AND e.date < $2 AND e.nature = 'saida' AND e.status = 'realizado'
      WHERE e.nature = 'saida' AND e.status = 'realizado'
      ORDER BY e.date DESC, e.created_at DESC`,
      [start, end],
    );
  });
}

export async function listAllExpenses(): Promise<ExpenseWithCategory[]> {
  return traceOperation("expense.listAll", async () => {
    const db = await getDb();
    return db.select<ExpenseWithCategory[]>(
      `SELECT e.*, c.name AS category_name, c.color AS category_color
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     ORDER BY e.date DESC, e.created_at DESC`,
    );
  });
}

export async function createExpense(
  input: CreateExpenseInput,
): Promise<Expense> {
  return traceOperation("expense.create", async () => {
    const description = validateDescription(input.description);
    const amount_cents = validateAmount(input.amount_cents);
    const date = validateDate(input.date);
    const category_id = await validateCategoryId(input.category_id);
    const db = await getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO expenses (id, category_id, description, amount_cents, date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [id, category_id, description, amount_cents, date, now],
    );
    return {
      id,
      category_id,
      description,
      amount_cents,
      date,
      created_at: now,
      updated_at: now,
    };
  });
}

export async function updateExpense(
  id: string,
  input: Partial<CreateExpenseInput>,
): Promise<void> {
  return traceOperation("expense.update", async () => {
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
    if (sets.length === 0) return;

    const db = await getDb();
    params.push(new Date().toISOString());
    sets.push(`updated_at = $${params.length}`);
    params.push(id);
    await db.execute(
      `UPDATE expenses SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params,
    );
  });
}

export async function deleteExpense(id: string): Promise<void> {
  return traceOperation("expense.delete", async () => {
    const db = await getDb();
    await db.execute("DELETE FROM expenses WHERE id = $1", [id]);
  });
}

export async function monthlyTotal(
  year: number,
  month: number,
): Promise<number> {
  return traceOperation("expense.monthlyTotal", async () => {
    const db = await getDb();
    const { start, end } = monthRange(year, month);
    const rows = await db.select<{ total: number | null }[]>(
      "SELECT SUM(amount_cents) AS total FROM expenses WHERE date >= $1 AND date < $2 AND nature = 'saida' AND status = 'realizado'",
      [start, end],
    );
    return rows[0]?.total ?? 0;
  });
}

export async function monthlyTotalsByCategory(
  year: number,
  month: number,
): Promise<CategoryTotal[]> {
  return traceOperation("expense.monthlyTotalsByCategory", async () => {
    const db = await getDb();
    const { start, end } = monthRange(year, month);
    return db.select<CategoryTotal[]>(
      `SELECT e.category_id AS category_id,
            c.name AS category_name,
            c.color AS category_color,
            SUM(e.amount_cents) AS total_cents
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
      WHERE e.date >= $1 AND e.date < $2 AND e.nature = 'saida' AND e.status = 'realizado'
     GROUP BY e.category_id, c.name, c.color
     ORDER BY total_cents DESC`,
      [start, end],
    );
  });
}
