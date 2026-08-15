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

export interface CreateCategoryInput {
  name: string;
  icon: string;
  color: string;
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

export interface CategoryTotal {
  category_id: string;
  category_name: string;
  category_color: string;
  total_cents: number;
}
