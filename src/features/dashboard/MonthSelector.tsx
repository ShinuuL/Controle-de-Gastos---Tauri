import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthLabel } from "../../lib/date";

interface MonthSelectorProps {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

export default function MonthSelector({ year, month, onChange }: MonthSelectorProps) {
  const shift = (delta: number) => {
    const date = new Date(year, month - 1 + delta, 1);
    onChange(date.getFullYear(), date.getMonth() + 1);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Mês anterior"
        className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <span className="min-w-40 text-center text-sm font-medium capitalize">
        {formatMonthLabel(year, month)}
      </span>
      <button
        type="button"
        onClick={() => shift(1)}
        aria-label="Próximo mês"
        className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}
