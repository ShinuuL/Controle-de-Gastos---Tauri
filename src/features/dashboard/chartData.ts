import type { CategoryTotal } from "../../lib/types";

export interface ChartSlice {
  name: string;
  value: number;
  color: string;
}

export const OTHERS_COLOR = "#94A3B8";

export function buildChartSlices(
  totals: CategoryTotal[],
  maxSlices = 6,
): ChartSlice[] {
  if (totals.length === 0) return [];
  if (totals.length <= maxSlices) {
    return totals.map((t) => ({
      name: t.category_name,
      value: t.total_cents,
      color: t.category_color,
    }));
  }

  const top = totals.slice(0, maxSlices - 1);
  const others = totals.slice(maxSlices - 1);
  const othersSum = others.reduce((acc, t) => acc + t.total_cents, 0);

  return [
    ...top.map((t) => ({
      name: t.category_name,
      value: t.total_cents,
      color: t.category_color,
    })),
    { name: "Outros", value: othersSum, color: OTHERS_COLOR },
  ];
}
