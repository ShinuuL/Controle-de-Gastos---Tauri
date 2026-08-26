import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { BalanceMoodCard } from "./BalanceMoodCard";

test("descreve o saldo realizado negativo com a reação correspondente", () => {
  const markup = renderToStaticMarkup(<BalanceMoodCard realizedCents={-1} />);

  expect(markup).toContain("Saldo realizado");
  expect(markup).toMatch(
    /<img[^>]*alt="Moranguinho preocupada com o saldo negativo"[^>]*\/>/,
  );
  expect(markup).toContain("−R$\u00a00,01");
  expect(markup).toContain("saldo negativo");
});

test("mantém imagem e conteúdo lado a lado no desktop amplo", () => {
  const markup = renderToStaticMarkup(<BalanceMoodCard realizedCents={0} />);

  expect(markup).toContain("sm:flex-row");
  expect(markup).not.toContain("xl:flex-col");
  expect(markup).not.toContain("xl:w-full");
});
