import type Database from "@tauri-apps/plugin-sql";
import { getDb } from "../db";
import type { Category, CreateCategoryInput } from "../types";

interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_preset: number;
  budget_monthly: number | null;
  sort_order: number;
  created_at: string;
}

function mapRow(row: CategoryRow): Category {
  return {
    ...row,
    is_preset: row.is_preset === 1,
  };
}

async function nextSortOrder(db: Database): Promise<number> {
  const rows = await db.select<{ max: number | null }[]>(
    "SELECT MAX(sort_order) AS max FROM categories",
  );
  return (rows[0]?.max ?? -1) + 1;
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.select<CategoryRow[]>(
    "SELECT * FROM categories ORDER BY is_preset DESC, sort_order ASC, name ASC",
  );
  return rows.map(mapRow);
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const sortOrder = await nextSortOrder(db);
  await db.execute(
    "INSERT INTO categories (id, name, icon, color, is_preset, sort_order, created_at) VALUES ($1, $2, $3, $4, 0, $5, $6)",
    [id, input.name, input.icon, input.color, sortOrder, now],
  );
  return {
    id,
    name: input.name,
    icon: input.icon,
    color: input.color,
    is_preset: false,
    budget_monthly: null,
    sort_order: sortOrder,
    created_at: now,
  };
}

export async function updateCategoryBudget(id: string, budgetMonthly: number | null): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE categories SET budget_monthly = $1 WHERE id = $2", [
    budgetMonthly,
    id,
  ]);
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM expenses WHERE category_id = $1",
    [id],
  );
  if ((rows[0]?.n ?? 0) > 0) {
    throw new Error("Categoria possui gastos e não pode ser excluída.");
  }
  await db.execute("DELETE FROM categories WHERE id = $1", [id]);
}
