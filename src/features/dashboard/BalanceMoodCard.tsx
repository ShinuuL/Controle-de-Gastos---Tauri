import { formatSignedBRL } from "../../lib/currency";
import { STRAWBERRY_MOOD_ASSETS } from "../theme/strawberryAssets";
import { balanceMoodFor } from "./balanceMood";

export function BalanceMoodCard({
  realizedCents,
}: {
  realizedCents: number;
}) {
  const mood = balanceMoodFor(realizedCents);
  const asset = STRAWBERRY_MOOD_ASSETS[mood];

  return (
    <section
      className="flex w-full flex-col gap-4 rounded-lg border border-border bg-surface p-5 sm:flex-row sm:items-center xl:flex-col xl:items-start transition-[opacity,transform] duration-200 motion-reduce:transition-none"
      aria-labelledby="balance-mood-title"
    >
      <img
        className="h-28 w-full object-contain sm:w-36 xl:w-full"
        src={asset.src}
        alt={asset.alt}
      />
      <div>
        <p id="balance-mood-title" className="text-sm text-muted-foreground">
          Saldo realizado
        </p>
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
          {formatSignedBRL(realizedCents)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{asset.message}</p>
      </div>
    </section>
  );
}
