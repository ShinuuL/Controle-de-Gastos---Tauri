import { useCallback, useEffect, useState } from "react";
import MonthSelector from "./MonthSelector";
import ExpensePieChart from "./ExpensePieChart";
import CategoryBreakdown from "./CategoryBreakdown";
import { buildChartSlices } from "./chartData";
import { monthlyTotal, monthlyTotalsByCategory } from "../../lib/repositories/expenses";
import { formatBRL } from "../../lib/currency";
import { formatMonthLabel } from "../../lib/date";
import type { CategoryTotal } from "../../lib/types";

export default function DashboardScreen() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [total, setTotal] = useState<number | null>(null);
  const [totals, setTotals] = useState<CategoryTotal[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    Promise.all([monthlyTotal(year, month), monthlyTotalsByCategory(year, month)])
      .then(([monthTotal, categoryTotals]) => {
        if (cancelled) return;
        setTotal(monthTotal);
        setTotals(categoryTotals);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
      });

    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const handleMonthChange = useCallback((nextYear: number, nextMonth: number) => {
    setYear(nextYear);
    setMonth(nextMonth);
  }, []);

  const slices = buildChartSlices(totals);

  return (
    <section className="space-y-6 p-4 md:p-8" aria-labelledby="dashboard-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="dashboard-title" className="text-xl font-semibold tracking-tight">
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
      ) : total === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum gasto em {formatMonthLabel(year, month)}. Adicione sua primeira despesa na aba
          Despesas.
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-border bg-surface p-5" aria-label="Total do mês">
            <p className="text-sm text-muted-foreground">
              Total em {formatMonthLabel(year, month)}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{formatBRL(total)}</p>
          </section>

          <section
            className="rounded-lg border border-border bg-surface p-5"
            aria-labelledby="chart-title"
          >
            <h3 id="chart-title" className="mb-4 text-sm font-medium">
              Gastos por categoria
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
