import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "motion/react";
import type { ChartSlice } from "./chartData";
import { formatBRL } from "../../lib/currency";

interface ExpensePieChartProps {
  slices: ChartSlice[];
  totalCents: number;
}

const RADIAN = Math.PI / 180;

function percentLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent } = props;
  if (!percent || percent < 0.05) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      stroke="rgba(15, 23, 42, 0.45)"
      strokeWidth={3}
      paintOrder="stroke"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

export default function ExpensePieChart({ slices, totalCents }: ExpensePieChartProps) {
  if (slices.length === 0 || totalCents === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Nenhum gasto neste mês.
      </div>
    );
  }

  const summary = slices
    .map((slice) => `${slice.name} ${((slice.value / totalCents) * 100).toFixed(1)}%`)
    .join(", ");

  const tooltipStyle: React.CSSProperties = {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "0.5rem",
    color: "var(--foreground)",
    fontSize: "0.875rem",
    boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
  };

  return (
    <div className="relative h-64" role="img" aria-label={`Distribuição de gastos: ${summary}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            startAngle={90}
            endAngle={-270}
            paddingAngle={slices.length > 1 ? 2 : 0}
            stroke="none"
            label={percentLabel}
          >
            {slices.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [formatBRL(Number(value)), "Valor"]}
            contentStyle={tooltipStyle}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={totalCents}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="text-2xl font-semibold tracking-tight"
        >
          {formatBRL(totalCents)}
        </motion.span>
        <span className="text-xs text-muted-foreground">Total</span>
      </div>
    </div>
  );
}
