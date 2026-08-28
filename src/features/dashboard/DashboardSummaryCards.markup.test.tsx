import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { DashboardSummaryCards } from "./DashboardSummaryCards";

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

test("mostra o totalizador de entradas e, sem arte propria, sem mascote", () => {
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
  // O slot STRAWBERRY_DECORATIVE_ASSETS.entradas ainda nao tem arquivo:
  // o card precisa renderizar sem <img> ate a arte existir.
  expect(entradas).not.toContain("<img");
  expect(entradas).not.toContain("custard");
  expect(entradas).not.toContain("pupcake");
});
