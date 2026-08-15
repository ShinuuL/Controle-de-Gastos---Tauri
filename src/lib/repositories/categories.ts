import type Database from "@tauri-apps/plugin-sql";
import { monthRange } from "../date";
import { getDb } from "../db";
import type {
  Category,
  CategoryBudgetProgress,
  CreateCategoryInput,
} from "../types";

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

interface CategoryBudgetProgressRow extends CategoryRow {
  spent_cents: number;
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

export async function listCategoryBudgetProgress(
  year: number,
  month: number,
): Promise<CategoryBudgetProgress[]> {
  const db = await getDb();
  const { start, end } = monthRange(year, month);
  const rows = await db.select<CategoryBudgetProgressRow[]>(
    `SELECT c.*, COALESCE(SUM(e.amount_cents), 0) AS spent_cents
     FROM categories c
     LEFT JOIN expenses e ON e.category_id = c.id AND e.date >= $1 AND e.date < $2
     GROUP BY c.id, c.name, c.icon, c.color, c.is_preset, c.budget_monthly, c.sort_order, c.created_at
     ORDER BY c.is_preset DESC, c.sort_order ASC, c.name ASC`,
    [start, end],
  );
  return rows.map((row) => ({ ...mapRow(row), spent_cents: row.spent_cents }));
}

export async function createCategory(
  input: CreateCategoryInput,
): Promise<Category> {
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome da categoria.");
  const icon = input.icon.trim();
  if (!icon) throw new Error("Informe o ícone da categoria.");
  if (!/^#[0-9A-Fa-f]{6}$/.test(input.color)) {
    throw new Error("Informe uma cor hexadecimal válida.");
  }
  const budgetMonthly = input.budget_monthly ?? null;
  if (
    budgetMonthly !== null &&
    (!Number.isSafeInteger(budgetMonthly) || budgetMonthly <= 0)
  ) {
    throw new Error("Informe um orçamento válido maior que zero.");
  }
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const sortOrder = await nextSortOrder(db);
  await db.execute(
    "INSERT INTO categories (id, name, icon, color, is_preset, budget_monthly, sort_order, created_at) VALUES ($1, $2, $3, $4, 0, $5, $6, $7)",
    [id, name, icon, input.color, budgetMonthly, sortOrder, now],
  );
  return {
    id,
    name,
    icon,
    color: input.color,
    is_preset: false,
    budget_monthly: budgetMonthly,
    sort_order: sortOrder,
    created_at: now,
  };
}

export async function updateCategoryBudget(
  id: string,
  budgetMonthly: number | null,
): Promise<void> {
  const categoryId = id.trim();
  if (!categoryId) throw new Error("Categoria não encontrada.");
  if (
    budgetMonthly !== null &&
    (!Number.isSafeInteger(budgetMonthly) || budgetMonthly <= 0)
  ) {
    throw new Error("Informe um orçamento válido maior que zero.");
  }
  const db = await getDb();
  const result = await db.execute(
    "UPDATE categories SET budget_monthly = $1 WHERE id = $2",
    [budgetMonthly, categoryId],
  );
  if (result.rowsAffected !== 1) throw new Error("Categoria não encontrada.");
}

export async function deleteCategory(id: string): Promise<void> {
  const categoryId = id.trim();
  if (!categoryId) throw new Error("Categoria não encontrada.");
  const db = await getDb();
  const categories = await db.select<Pick<CategoryRow, "is_preset">[]>(
    "SELECT is_preset FROM categories WHERE id = $1",
    [categoryId],
  );
  if (!categories[0]) throw new Error("Categoria não encontrada.");
  if (categories[0]?.is_preset === 1) {
    throw new Error("Categorias padrão não podem ser excluídas.");
  }
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM expenses WHERE category_id = $1",
    [categoryId],
  );
  if ((rows[0]?.n ?? 0) > 0) {
    throw new Error("Categoria possui gastos e não pode ser excluída.");
  }
  await db.execute("DELETE FROM categories WHERE id = $1", [categoryId]);
}
