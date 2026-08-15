export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_preset: boolean;
  budget_monthly: number | null;
  sort_order: number;
  created_at: string;
}

export interface CategoryBudgetProgress extends Category {
  spent_cents: number;
}

export interface CreateCategoryInput {
  name: string;
  icon: string;
  color: string;
  budget_monthly?: number | null;
}

export interface Expense {
  id: string;
  category_id: string;
  description: string;
  amount_cents: number;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseWithCategory extends Expense {
  category_name: string;
  category_color: string;
}

export interface CreateExpenseInput {
  category_id: string;
  description: string;
  amount_cents: number;
  date: string;
}

export type MovementNature = "entrada" | "saida";
export type MovementStatus = "previsto" | "realizado";

export interface Transaction {
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

export interface CategoryTotal {
  category_id: string;
  category_name: string;
  category_color: string;
  total_cents: number;
}
