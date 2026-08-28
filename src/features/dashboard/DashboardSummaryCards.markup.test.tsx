import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { DashboardSummaryCards } from "./DashboardSummaryCards";
import { STRAWBERRY_DECORATIVE_ASSETS } from "../theme/strawberryAssets";

function summaryCard(markup: string, label: string): string | undefined {
  return markup.match(
    new RegExp(`<section(?=[^>]*aria-label="${label}")[^>]*>.*?</section>`),
  )?.[0];
}

test("associa exclusivamente Custard a Realizado e Pupcake a Projeção", () => {
  const markup = renderToStaticMarkup(
    <DashboardSummaryCards
      realizedCents={375_000}
      projectedCents={480_000}
      incomeCents={620_000}
      strawberry
    />,
  );

  const realized = summaryCard(markup, "Realizado no mês");
  const projected = summaryCard(markup, "Projeção do mês");

  expect(realized).toContain("custard");
  expect(realized).not.toContain("pupcake");
  expect(projected).toContain("pupcake");
  expect(projected).not.toContain("custard");
  expect(realized).toMatch(/<img[^>]*alt=""[^>]*aria-hidden="true"[^>]*\/>/);
  expect(projected).toMatch(/<img[^>]*alt=""[^>]*aria-hidden="true"[^>]*\/>/);
  expect(markup).toContain("pr-28");
  expect(markup).toContain("whitespace-nowrap");
});

test("does not render decorative mascots outside Moranguinho", () => {
  const markup = renderToStaticMarkup(
    <DashboardSummaryCards
      realizedCents={375_000}
      projectedCents={480_000}
      incomeCents={620_000}
      strawberry={false}
    />,
  );

  expect(markup).not.toContain("custard");
  expect(markup).not.toContain("pupcake");
});

test("mostra o totalizador de entradas, com mascote so se a arte existir", () => {
  const markup = renderToStaticMarkup(
    <DashboardSummaryCards
      realizedCents={375_000}
      projectedCents={480_000}
      incomeCents={620_000}
      strawberry
    />,
  );

  const entradas = summaryCard(markup, "Entradas do mês");
  expect(entradas).toBeDefined();
  expect(entradas).toContain("Entradas");

  // O asset e resolvido por padrao de nome (import.meta.glob): pode existir ou
  // nao. O que precisa valer nos dois casos e que o card renderize, e que o
  // mascote apareca exatamente quando ha arte -- nunca um placeholder quebrado.
  const temArte = Boolean(STRAWBERRY_DECORATIVE_ASSETS.entradas);
  expect(entradas?.includes("<img")).toBe(temArte);

  // E nunca reaproveita o mascote de outro card: cada um tem o seu.
  expect(entradas).not.toContain("custard");
  expect(entradas).not.toContain("pupcake");
});
