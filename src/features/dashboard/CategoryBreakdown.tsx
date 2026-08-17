import type { CategoryTotal } from "../../lib/types";
import { formatSignedBRL } from "../../lib/currency";

interface CategoryBreakdownProps {
  totals: CategoryTotal[];
}

export default function CategoryBreakdown({ totals }: CategoryBreakdownProps) {
  if (totals.length === 0) return null;

  const grandTotalAbs = totals.reduce(
    (acc, t) => acc + Math.abs(t.total_cents),
    0,
  );

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th scope="col" className="pb-2 pr-3 font-medium">
            Categoria
          </th>
          <th scope="col" className="pb-2 pr-3 text-right font-medium">
            Valor
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            %
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {totals.map((t) => (
          <tr key={t.category_id}>
            <td className="flex items-center gap-2 py-2 pr-3">
              <span
                className="inline-block size-3 shrink-0 rounded-full"
                style={{ backgroundColor: t.category_color }}
                aria-hidden
              />
              {t.category_name}
            </td>
            <td className="py-2 pr-3 text-right tabular-nums">
              {formatSignedBRL(t.total_cents)}
            </td>
            <td className="py-2 text-right tabular-nums text-muted-foreground">
              {grandTotalAbs > 0
                ? ((Math.abs(t.total_cents) / grandTotalAbs) * 100).toFixed(1)
                : "0.0"}
              %
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
