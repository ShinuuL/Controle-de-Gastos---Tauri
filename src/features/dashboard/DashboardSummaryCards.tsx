import { formatSignedBRL } from "../../lib/currency";
import { STRAWBERRY_DECORATIVE_ASSETS } from "../theme/strawberryAssets";
import { BalanceMoodCard } from "./BalanceMoodCard";

function signColor(cents: number): string {
  if (cents > 0) return "text-success";
  if (cents < 0) return "text-danger";
  return "text-foreground";
}

function SummaryCard({
  title,
  description,
  cents,
  mascot,
  ariaLabel,
}: {
  title: string;
  description: string;
  cents: number;
  mascot?: string;
  ariaLabel?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-border bg-surface p-5 ${mascot ? "relative overflow-hidden pr-28" : ""}`}
      aria-label={ariaLabel ?? `${title} no mês`}
    >
      <div className="relative z-10">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p
          className={`mt-1 whitespace-nowrap text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${signColor(cents)}`}
        >
          {formatSignedBRL(cents)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {mascot && (
        <img
          className="pointer-events-none absolute right-2 bottom-1 z-0 h-27 w-23 object-contain"
          src={mascot}
          alt=""
          aria-hidden="true"
        />
      )}
    </section>
  );
}

export function DashboardSummaryCards({
  realizedCents,
  projectedCents,
  incomeCents,
  strawberry,
}: {
  realizedCents: number;
  projectedCents: number;
  incomeCents: number;
  strawberry: boolean;
}) {
  return (
    <div
      className={`grid gap-3 ${strawberry ? "xl:grid-cols-[1.05fr_repeat(3,minmax(0,1fr))]" : "sm:grid-cols-2 lg:grid-cols-3"}`}
    >
      {strawberry && <BalanceMoodCard realizedCents={realizedCents} />}
      <SummaryCard
        title="Realizado"
        description="Movimentações efetivadas no mês."
        cents={realizedCents}
        mascot={strawberry ? STRAWBERRY_DECORATIVE_ASSETS.custard : undefined}
      />
      <SummaryCard
        title="Projeção"
        description="Inclui movimentações previstas."
        cents={projectedCents}
        mascot={strawberry ? STRAWBERRY_DECORATIVE_ASSETS.pupcake : undefined}
        ariaLabel="Projeção do mês"
      />
      <SummaryCard
        title="Entradas"
        description="Tudo que entrou no mês, previstas incluídas."
        cents={incomeCents}
        mascot={strawberry ? STRAWBERRY_DECORATIVE_ASSETS.entradas : undefined}
        ariaLabel="Entradas do mês"
      />
    </div>
  );
}
