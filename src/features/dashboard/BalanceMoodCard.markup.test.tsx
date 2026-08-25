import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { BalanceMoodCard } from "./BalanceMoodCard";

test("descreve o saldo realizado negativo com a reação correspondente", () => {
  const markup = renderToStaticMarkup(<BalanceMoodCard realizedCents={-1} />);

  expect(markup).toContain("Saldo realizado");
  expect(markup).toContain("saldo negativo");
});
