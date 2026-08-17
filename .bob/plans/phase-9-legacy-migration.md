# Plan: Phase 9 — Legacy Migration

**Objective:** Migrate DashboardScreen to the transactions repository, add missing aggregate functions, remove ExpensesScreen and its tab, and clean up all legacy expenses code.

**Phases:** 4 · **Manager groups:** max 5 workers per group

## Architecture Decisions

1. **New aggregate functions** (`monthlyTotal`, `monthlyTotalsByCategory`) are added to `transactions.ts` without nature/status filters. The dashboard now shows ALL transactions. Amounts are signed: `entrada` positive, `saida` negative.
2. **Dashboard migration:** Replace expenses repo imports with transactions repo. Add `listTransactionsByMonth` call + `calculateMonthlyResult` for realized/projected summary cards. Keep existing pie chart + category table.
3. **`listCategoryBudgetProgress` fix:** Add `AND e.nature = c.nature` to the LEFT JOIN so categories only sum transactions matching their own nature. The `categories` table has a `nature` column (migration v1) that isn't exposed in the TypeScript type but is available in SQL.
4. **ExpensesScreen removal:** Delete the entire `src/features/expenses/` directory and remove the "expenses" tab from navigation. TransactionsScreen is a strict superset.
5. **expenses.ts lifecycle:** Delete entirely — no backward compatibility needed.
6. **No Rust migration changes:** The `expenses` table already supports `nature`/`status`. No schema changes required. The `migrations().len() == 2` test stays unchanged.
7. **Telemetry:** Add `transaction.monthlyTotal` and `transaction.monthlyTotalsByCategory` to the allowlist. Remove `expense.*` operations.

## Phase 1 — Foundation (parallel: 1.1, 1.2 run concurrently; 1.3 depends on 1.1)

- [1.1] Add aggregate functions to transactions repository — owner: build — parallel: yes (disjoint file from 1.2) — deps: none — files: `src/lib/repositories/transactions.ts` — risk: medium

  Add two exported functions after the existing `deleteTransaction`:

  ```typescript
  export async function monthlyTotal(
    year: number,
    month: number,
  ): Promise<number> {
    return traceOperation("transaction.monthlyTotal", async () => {
      const db = await getDb();
      const { start, end } = monthRange(year, month);
      const rows = await db.select<{ total: number | null }[]>(
        `SELECT SUM(
           CASE WHEN nature = 'entrada' THEN amount_cents ELSE -amount_cents END
         ) AS total
         FROM expenses
         WHERE date >= $1 AND date < $2`,
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
        `SELECT e.category_id AS category_id,
                c.name AS category_name,
                c.color AS category_color,
                SUM(
                  CASE WHEN e.nature = 'entrada' THEN e.amount_cents ELSE -e.amount_cents END
                ) AS total_cents
         FROM expenses e
         JOIN categories c ON c.id = e.category_id
         WHERE e.date >= $1 AND e.date < $2
         GROUP BY e.category_id, c.name, c.color
         ORDER BY total_cents DESC`,
        [start, end],
      );
    });
  }
  ```

  Add `CategoryTotal` to the existing imports at the top of the file:
  ```typescript
  import type {
    CategoryTotal,
    CreateTransactionInput,
    Transaction,
    TransactionWithCategory,
    UpdateTransactionInput,
  } from "../types";
  ```

  **Key design:** No `nature = 'saida'` or `status = 'realizado'` filter — shows everything. Signed amounts via `CASE WHEN nature = 'entrada' THEN amount_cents ELSE -amount_cents END`. The pie chart and table will show both income and expense categories; downstream consumers handle presentation.

- [1.2] Fix `listCategoryBudgetProgress` nature filter — owner: build — parallel: yes (disjoint file from 1.1) — deps: none — files: `src/lib/repositories/categories.ts` — risk: low

  In `listCategoryBudgetProgress` (line 50–70), change the LEFT JOIN condition from:
  ```sql
  LEFT JOIN expenses e ON e.category_id = c.id AND e.date >= $1 AND e.date < $2
  ```
  to:
  ```sql
  LEFT JOIN expenses e ON e.category_id = c.id AND e.nature = c.nature AND e.date >= $1 AND e.date < $2
  ```

  **Rationale:** The `categories` table has a `nature` column (migration v1: `nature TEXT NOT NULL DEFAULT 'saida'`). Without this filter, income categories (e.g. "Salário") would incorrectly sum expense transactions. The old ExpensesScreen never created `entrada` transactions so this bug was invisible; the new TransactionsScreen exposes it.

- [1.3] Add tests for new aggregate functions — owner: build — parallel: no (depends on 1.1 — must test the new functions) — deps: 1.1 — files: `src/lib/repositories/transactions.test.ts` — risk: low

  Extend the existing `createFakeDb` to handle the new SELECT queries (SUM with CASE). Add two new test blocks inside the `describe("transaction repository")`:

  ```typescript
  describe("monthlyTotal", () => {
    it("returns the signed net total across all natures and statuses", async () => {
      const fake = createFakeDb();
      fake.selectCalls.length = 0; // reset
      // Override select to return a sum result
      const originalSelect = fake.db.select;
      fake.db.select = async (query: string, values?: unknown[]) => {
        fake.selectCalls.push({ query, values });
        if (query.includes("SUM")) {
          return [{ total: 3750 }];
        }
        return originalSelect(query, values);
      };
      getDb.mockResolvedValue(fake.db);

      const total = await monthlyTotal(2026, 1);

      expect(total).toBe(3750);
      expect(fake.selectCalls[0]?.query).toContain("SUM(");
      expect(fake.selectCalls[0]?.query).toContain("CASE WHEN nature = 'entrada'");
      expect(fake.selectCalls[0]?.query).not.toContain("nature = 'saida'");
      expect(fake.selectCalls[0]?.values).toEqual(["2026-01-01", "2026-02-01"]);
    });

    it("returns 0 when no rows match", async () => {
      const fake = createFakeDb();
      fake.db.select = async (query: string, values?: unknown[]) => {
        fake.selectCalls.push({ query, values });
        if (query.includes("SUM")) return [{ total: null }];
        throw new Error("Unexpected query");
      };
      getDb.mockResolvedValue(fake.db);

      const total = await monthlyTotal(2026, 1);
      expect(total).toBe(0);
    });
  });

  describe("monthlyTotalsByCategory", () => {
    it("returns signed totals grouped by category with no nature filter", async () => {
      const rows = [
        { category_id: "food", category_name: "Alimentação", category_color: "#123456", total_cents: -5000 },
        { category_id: "salary", category_name: "Salário", category_color: "#654321", total_cents: 10000 },
      ];
      const fake = createFakeDb();
      fake.db.select = async (query: string, values?: unknown[]) => {
        fake.selectCalls.push({ query, values });
        if (query.includes("SUM") && query.includes("GROUP BY")) return rows;
        throw new Error("Unexpected query");
      };
      getDb.mockResolvedValue(fake.db);

      const result = await monthlyTotalsByCategory(2026, 1);

      expect(result).toEqual(rows);
      expect(fake.selectCalls[0]?.query).toContain("CASE WHEN e.nature = 'entrada'");
      expect(fake.selectCalls[0]?.query).not.toContain("e.nature = 'saida'");
      expect(fake.selectCalls[0]?.values).toEqual(["2026-01-01", "2026-02-01"]);
    });
  });
  ```

  Add the new imports at the top:
  ```typescript
  import {
    createTransaction,
    deleteTransaction,
    listTransactionsByMonth,
    monthlyTotal,
    monthlyTotalsByCategory,
    updateTransaction,
  } from "./transactions";
  ```

## Phase 2 — Consumer Migration (parallel: 2.1 and 2.2; 2.3 depends on both)

- [2.1] Rewrite DashboardScreen to use transactions repo — owner: build — parallel: yes (disjoint file from 2.2) — deps: 1.1 — files: `src/features/dashboard/DashboardScreen.tsx` — risk: medium

  Replace the entire DashboardScreen. Key changes:
  - Import `monthlyTotal`, `monthlyTotalsByCategory`, `listTransactionsByMonth` from `../../lib/repositories/transactions`
  - Import `calculateMonthlyResult` from `../transactions/summary`
  - Import `formatSignedBRL` from `../../lib/currency`
  - Remove import of `monthlyTotal` and `monthlyTotalsByCategory` from `../../lib/repositories/expenses`
  - Add three data states: `total` (number), `totals` (CategoryTotal[]), `summary` ({ realized_cents, projected_cents })
  - Add `transactions` fetch in `Promise.all` and compute `calculateMonthlyResult(transactions)` for the summary cards
  - Add two summary cards: "Realizado" and "Projeção" using `formatSignedBRL`
  - Update empty state text: "Nenhuma movimentação em {month}..."
  - Update pie chart section title: "Movimentações por categoria"

  Full replacement:

  ```typescript
  import { useCallback, useEffect, useState } from "react";
  import MonthSelector from "./MonthSelector";
  import ExpensePieChart from "./ExpensePieChart";
  import CategoryBreakdown from "./CategoryBreakdown";
  import { buildChartSlices } from "./chartData";
  import {
    monthlyTotal,
    monthlyTotalsByCategory,
    listTransactionsByMonth,
  } from "../../lib/repositories/transactions";
  import { calculateMonthlyResult } from "../transactions/summary";
  import { formatBRL, formatSignedBRL } from "../../lib/currency";
  import { formatMonthLabel } from "../../lib/date";
  import type { CategoryTotal } from "../../lib/types";

  export default function DashboardScreen() {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth() + 1);
    const [total, setTotal] = useState<number | null>(null);
    const [totals, setTotals] = useState<CategoryTotal[]>([]);
    const [summary, setSummary] = useState<{
      realized_cents: number;
      projected_cents: number;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      let cancelled = false;
      setError(null);

      Promise.all([
        monthlyTotal(year, month),
        monthlyTotalsByCategory(year, month),
        listTransactionsByMonth(year, month),
      ])
        .then(([monthTotal, categoryTotals, transactions]) => {
          if (cancelled) return;
          setTotal(monthTotal);
          setTotals(categoryTotals);
          setSummary(calculateMonthlyResult(transactions));
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(
            err instanceof Error ? err.message : "Erro ao carregar dados.",
          );
        });

      return () => {
        cancelled = true;
      };
    }, [year, month]);

    const handleMonthChange = useCallback(
      (nextYear: number, nextMonth: number) => {
        setYear(nextYear);
        setMonth(nextMonth);
      },
      [],
    );

    const slices = buildChartSlices(totals);

    return (
      <section className="space-y-6 p-4 md:p-8" aria-labelledby="dashboard-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="dashboard-title"
            className="text-xl font-semibold tracking-tight"
          >
            Resumo
          </h2>
          <MonthSelector year={year} month={month} onChange={handleMonthChange} />
        </div>

        {error ? (
          <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
            {error}
          </p>
        ) : total === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : total === 0 && (summary?.realized_cents ?? 0) === 0 && (summary?.projected_cents ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhuma movimentação em {formatMonthLabel(year, month)}. Adicione
            sua primeira transação na aba Movimentações.
          </div>
        ) : (
          <>
            <section
              className="rounded-lg border border-border bg-surface p-5"
              aria-label="Saldo do mês"
            >
              <p className="text-sm text-muted-foreground">
                Saldo em {formatMonthLabel(year, month)}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {formatSignedBRL(total)}
              </p>
            </section>

            {summary && (
              <section
                className="grid gap-4 sm:grid-cols-2"
                aria-label="Realizado e projeção"
              >
                <div className="rounded-lg border border-border bg-surface p-5">
                  <p className="text-sm text-muted-foreground">Realizado</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {formatSignedBRL(summary.realized_cents)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface p-5">
                  <p className="text-sm text-muted-foreground">Projeção</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {formatSignedBRL(summary.projected_cents)}
                  </p>
                </div>
              </section>
            )}

            <section
              className="rounded-lg border border-border bg-surface p-5"
              aria-labelledby="chart-title"
            >
              <h3 id="chart-title" className="mb-4 text-sm font-medium">
                Movimentações por categoria
              </h3>
              <ExpensePieChart slices={slices} totalCents={total} />
            </section>

            <section
              className="rounded-lg border border-border bg-surface p-5"
              aria-labelledby="breakdown-title"
            >
              <h3 id="breakdown-title" className="mb-3 text-sm font-medium">
                Detalhamento
              </h3>
              <CategoryBreakdown totals={totals} />
            </section>
          </>
        )}
      </section>
    );
  }
  ```

  **Note:** Verify `formatSignedBRL` exists in `src/lib/currency.ts`. If it doesn't exist yet, add it:
  ```typescript
  export function formatSignedBRL(cents: number): string {
    const abs = Math.abs(cents);
    const formatted = (abs / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    return cents < 0 ? `- ${formatted}` : formatted;
  }
  ```

- [2.2] Update telemetry allowlist and remove expenses tab — owner: build — parallel: yes (disjoint files from 2.1) — deps: none — files: `src/lib/observability/telemetry.ts`, `src/components/layout/tabs.ts`, `src/components/layout/AppShell.tsx` — risk: low

  **2.2a — telemetry.ts:** Replace the expense operations with transaction equivalents in the `METRIC_OPERATIONS` set:

  Remove:
  ```
  "expense.listMonth",
  "expense.listAll",
  "expense.create",
  "expense.update",
  "expense.delete",
  "expense.monthlyTotal",
  "expense.monthlyTotalsByCategory",
  ```

  Add:
  ```
  "transaction.monthlyTotal",
  "transaction.monthlyTotalsByCategory",
  ```

  Resulting set:
  ```typescript
  const METRIC_OPERATIONS = new Set([
    "category.list",
    "category.listBudgetProgress",
    "category.create",
    "category.updateBudget",
    "category.delete",
    "transaction.listMonth",
    "transaction.create",
    "transaction.update",
    "transaction.delete",
    "transaction.monthlyTotal",
    "transaction.monthlyTotalsByCategory",
  ]);
  ```

  **2.2b — tabs.ts:** Remove the "expenses" tab entry. Update `TabId` type:

  ```typescript
  import {
    ArrowLeftRight,
    LayoutDashboard,
    Tags,
    type LucideIcon,
  } from "lucide-react";

  export type TabId = "dashboard" | "transactions" | "categories";

  export interface TabDef {
    id: TabId;
    label: string;
    icon: LucideIcon;
  }

  export const TAB_DEFS: TabDef[] = [
    { id: "dashboard", label: "Resumo", icon: LayoutDashboard },
    { id: "transactions", label: "Movimentações", icon: ArrowLeftRight },
    { id: "categories", label: "Categorias", icon: Tags },
  ];
  ```

  **2.2c — AppShell.tsx:** Remove ExpensesScreen import and the `activeTab === "expenses"` branch:

  ```typescript
  import { useState } from "react";
  import Sidebar from "./Sidebar";
  import BottomNav from "./BottomNav";
  import type { TabId } from "./tabs";
  import DashboardScreen from "../../features/dashboard/DashboardScreen";
  import CategoriesScreen from "../../features/categories/CategoriesScreen";
  import TransactionsScreen from "../../features/transactions/TransactionsScreen";

  export default function AppShell() {
    const [activeTab, setActiveTab] = useState<TabId>("dashboard");

    const screen =
      activeTab === "dashboard" ? (
        <DashboardScreen />
      ) : activeTab === "transactions" ? (
        <TransactionsScreen />
      ) : (
        <CategoriesScreen />
      );

    return (
      <div className="flex min-h-dvh bg-background text-foreground">
        <Sidebar active={activeTab} onSelect={setActiveTab} />
        <main className="min-w-0 flex-1 pb-20 md:pb-0">{screen}</main>
        <BottomNav active={activeTab} onSelect={setActiveTab} />
      </div>
    );
  }
  ```

- [2.3] Verify currency helper exists — owner: general — parallel: yes (disjoint file from 2.1/2.2) — deps: none — files: `src/lib/currency.ts` — risk: low

  Read `src/lib/currency.ts` to confirm `formatSignedBRL` exists. If not, add it:
  ```typescript
  export function formatSignedBRL(cents: number): string {
    const abs = Math.abs(cents);
    const formatted = (abs / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    return cents < 0 ? `- ${formatted}` : formatted;
  }
  ```

  If it already exists, this step is a no-op.

## Phase 3 — Cleanup (parallel: 3.1 and 3.2; 3.3 depends on both)

- [3.1] Delete legacy expenses repository and tests — owner: general — parallel: yes (disjoint from 3.2) — deps: 2.1, 2.2 — files: `src/lib/repositories/expenses.ts`, `src/lib/repositories/expenses.test.ts` — risk: low

  Delete both files. After Phase 2, no file imports from `src/lib/repositories/expenses`.

- [3.2] Delete ExpensesScreen and related components — owner: general — parallel: yes (disjoint from 3.1) — deps: 2.2 — files: `src/features/expenses/ExpensesScreen.tsx`, `src/features/expenses/ExpenseList.tsx`, `src/features/expenses/ExpenseForm.tsx` — risk: low

  Delete the entire `src/features/expenses/` directory and all three files. After Phase 2, no file imports from this directory.

- [3.3] Remove unused legacy types — owner: general — parallel: no (depends on 3.1 and 3.2 to confirm no consumers remain) — deps: 3.1, 3.2 — files: `src/lib/types.ts` — risk: low

  Remove these types from `src/lib/types.ts`:
  - `Expense` (lines 23–31)
  - `ExpenseWithCategory` (lines 33–36)
  - `CreateExpenseInput` (lines 38–43)

  These types are only used by `expenses.ts` and `ExpensesScreen` (both deleted in Phase 3.1/3.2). Verify with a grep for `Expense\b` (excluding `Transaction`) that no other files reference them before deleting.

## Phase 4 — Verification (all parallel)

- [4.1] Run full verification suite — owner: general — parallel: yes — deps: Phase 3 — files: (none — read-only) — risk: low

  Run in sequence (each must pass before proceeding):
  ```bash
  npm run lint
  npm run typecheck
  npm test
  cd src-tauri && cargo check
  cd src-tauri && cargo test
  ```

  If `cargo test` fails with `migrations().len() == 2` assertion, verify no new migration was added (none should have been).

- [4.2] Visual browser verification — owner: vision — parallel: yes (with 4.1) — deps: Phase 3 — files: (none — read-only) — risk: low

  Start dev server and verify in browser:
  1. `npm run tauri dev` — app launches
  2. Dashboard screen loads with "Resumo" header
  3. Summary cards show "Realizado" and "Projeção" with BRL values
  4. Pie chart renders with category breakdown
  5. Category table shows per-category amounts
  6. Bottom navigation shows 3 tabs: Resumo, Movimentações, Categorias (no "Despesas")
  7. Sidebar (desktop) shows 3 tabs (no "Despesas")
  8. Navigate to Movimentações — full CRUD works
  9. Navigate to Categorias — budget progress shows correct per-category spent amounts
  10. Kill dev server when done

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `formatSignedBRL` doesn't exist in `currency.ts` | Dashboard won't compile | Step 2.3 checks and adds it before 2.1 runs |
| Negative totals in pie chart confuse Recharts | Visual glitch | `buildChartSlices` uses `value` directly — may need `Math.abs()` in chartData.ts if Recharts rejects negatives. Check during 4.2. |
| `listCategoryBudgetProgress` nature filter breaks existing behavior | Budget progress shows 0 for categories that previously summed all transactions | Low risk: old system only created `saida` transactions, so filter is a no-op for existing data. New `entrada` transactions will correctly be excluded from expense categories. |
| Removing `Expense`, `ExpenseWithCategory`, `CreateExpenseInput` types breaks something | TypeScript errors | Step 3.3 greps for all references before deleting. These types are only used by the deleted files. |
| `calculateMonthlyResult` import path changes | TypeScript errors | Verify the import path `../transactions/summary` is correct relative to `dashboard/DashboardScreen.tsx`. |

## Verification Checklist

- [ ] `npm run lint` passes with 0 errors
- [ ] `npm run typecheck` passes with 0 errors
- [ ] `npm test` passes (all tests green)
- [ ] `cd src-tauri && cargo check` passes
- [ ] `cd src-tauri && cargo test` passes (including `migrations().len() == 2`)
- [ ] Dashboard shows all transactions (entrada + saida, previsto + realizado)
- [ ] Dashboard summary cards show "Realizado" and "Projeção"
- [ ] Dashboard pie chart renders category breakdown
- [ ] Navigation has 3 tabs (no "Despesas")
- [ ] TransactionsScreen CRUD works
- [ ] CategoriesScreen budget progress shows correct per-category spending
- [ ] No file imports from `src/lib/repositories/expenses`
- [ ] No file imports from `src/features/expenses/`
- [ ] `src/features/expenses/` directory does not exist
- [ ] `src/lib/repositories/expenses.ts` does not exist
