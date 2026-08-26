import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { DashboardSummaryCards } from "./DashboardSummaryCards";

test("places Custard in Realizado and Pupcake in Projeção only for Moranguinho", () => {
  const markup = renderToStaticMarkup(
    <DashboardSummaryCards
      realizedCents={375_000}
      projectedCents={480_000}
      strawberry
    />,
  );

  expect(markup).toMatch(/Realizado[\s\S]*custard/);
  expect(markup).toMatch(/Projeção[\s\S]*pupcake/);
  expect(markup).toContain("pr-28");
  expect(markup).toContain("whitespace-nowrap");
});

test("does not render decorative mascots outside Moranguinho", () => {
  const markup = renderToStaticMarkup(
    <DashboardSummaryCards
      realizedCents={375_000}
      projectedCents={480_000}
      strawberry={false}
    />,
  );

  expect(markup).not.toContain("custard");
  expect(markup).not.toContain("pupcake");
});
