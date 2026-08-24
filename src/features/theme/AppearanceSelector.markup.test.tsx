import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AppearanceSelector } from "./AppearanceSelector";

describe("AppearanceSelector", () => {
  test("expõe as quatro preferências de aparência", () => {
    const markup = renderToStaticMarkup(<AppearanceSelector />);

    for (const label of [
      "Padrão do sistema",
      "Claro",
      "Escuro",
      "Moranguinho",
    ]) {
      expect(markup).toContain(label);
    }
  });
});
