import { useCallback, useEffect, useState } from "react";
import MonthSelector from "./MonthSelector";
import ExpensePieChart from "./ExpensePieChart";
import CategoryBreakdown from "./CategoryBreakdown";
import { buildChartSlices } from "./chartData";
import {
  monthlyTotalsByCategory,
  listTransactionsByMonth,
} from "../../lib/repositories/transactions";
import { calculateMonthlyResult } from "../transactions/summary";
import { formatMonthLabel } from "../../lib/date";
import type { CategoryTotal, TransactionWithCategory } from "../../lib/types";
import { useTheme } from "../theme/ThemeProvider";
import { BalanceMoodCard } from "./BalanceMoodCard";
import { DashboardSummaryCards } from "./DashboardSummaryCards";

export default function DashboardScreen() {
  const { resolvedTheme } = useTheme();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>(
    [],
  );
  const [totals, setTotals] = useState<CategoryTotal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);

    Promise.all([
      monthlyTotalsByCategory(year, month),
      listTransactionsByMonth(year, month),
    ])
      .then(([categoryTotals, monthTransactions]) => {
        if (cancelled) return;
        setTotals(categoryTotals);
        setTransactions(monthTransactions);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Erro ao carregar dados.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
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

  const summary = calculateMonthlyResult(transactions);

  const expenseTotals = totals
    .filter((t) => t.total_cents < 0)
    .map((t) => ({ ...t, total_cents: Math.abs(t.total_cents) }))
    .sort((a, b) => b.total_cents - a.total_cents);
  const slices = buildChartSlices(expenseTotals);
  const expensesTotalCents = expenseTotals.reduce(
    (acc, t) => acc + t.total_cents,
    0,
  );

  const hasData = transactions.length > 0;

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

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {!error && loading && (
        <p className="text-sm text-muted-foreground" aria-busy="true">
          Carregando…
        </p>
      )}

      {!error && !loading && !hasData && (
        <>
          {resolvedTheme === "strawberry" && <BalanceMoodCard realizedCents={0} />}
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhuma movimentação em {formatMonthLabel(year, month)}. Adicione sua
            primeira transação na aba Transações.
          </div>
        </>
      )}

      {!error && !loading && hasData && (
        <>
          <DashboardSummaryCards
            realizedCents={summary.realized_cents}
            projectedCents={summary.projected_cents}
            incomeCents={summary.income_cents}
            strawberry={resolvedTheme === "strawberry"}
          />

          <section
            className="rounded-lg border border-border bg-surface p-5"
            aria-labelledby="chart-title"
          >
            <h3 id="chart-title" className="mb-4 text-sm font-medium">
              Saídas por categoria
            </h3>
            <ExpensePieChart slices={slices} totalCents={expensesTotalCents} />
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
