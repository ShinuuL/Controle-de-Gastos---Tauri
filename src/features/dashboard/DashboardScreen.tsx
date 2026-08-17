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
import { formatSignedBRL } from "../../lib/currency";
import { formatMonthLabel } from "../../lib/date";
import type { CategoryTotal, TransactionWithCategory } from "../../lib/types";

function signColor(cents: number): string {
  if (cents > 0) return "text-success";
  if (cents < 0) return "text-danger";
  return "text-foreground";
}

export default function DashboardScreen() {
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

  const chartTotals = totals.map((t) => ({
    ...t,
    total_cents: Math.abs(t.total_cents),
  }));
  const slices = buildChartSlices(chartTotals);

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
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma movimentação em {formatMonthLabel(year, month)}. Adicione sua
          primeira transação na aba Transações.
        </div>
      )}

      {!error && !loading && hasData && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <section
              className="rounded-lg border border-border bg-surface p-5"
              aria-label="Realizado no mês"
            >
              <p className="text-sm text-muted-foreground">Realizado</p>
              <p
                className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${signColor(summary.realized_cents)}`}
              >
                {formatSignedBRL(summary.realized_cents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Movimentações efetivadas no mês.
              </p>
            </section>
            <section
              className="rounded-lg border border-border bg-surface p-5"
              aria-label="Projeção do mês"
            >
              <p className="text-sm text-muted-foreground">Projeção</p>
              <p
                className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${signColor(summary.projected_cents)}`}
              >
                {formatSignedBRL(summary.projected_cents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Inclui movimentações previstas.
              </p>
            </section>
          </div>

          <section
            className="rounded-lg border border-border bg-surface p-5"
            aria-labelledby="chart-title"
          >
            <h3 id="chart-title" className="mb-4 text-sm font-medium">
              Movimentações por categoria
            </h3>
            <ExpensePieChart
              slices={slices}
              totalCents={summary.projected_cents}
            />
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
