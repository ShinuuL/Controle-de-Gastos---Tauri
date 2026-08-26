import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AppearanceSelector } from "./AppearanceSelector";

describe("AppearanceSelector", () => {
  test("expõe apenas os três temas escolhíveis", () => {
    const markup = renderToStaticMarkup(<AppearanceSelector />);

    for (const label of [
      "Claro",
      "Escuro",
      "Moranguinho",
    ]) {
      expect(markup).toContain(label);
    }

    expect(markup).not.toContain("Padrão do sistema");
  });

  test("abre o popover compacto com backdrop próprio", () => {
    const markup = renderToStaticMarkup(<AppearanceSelector compact />);

    expect(markup).toContain('role="menu"');
    expect(markup).toContain('aria-label="Aparência"');
    expect(markup).toContain("fixed left-1/2 top-1/2");
    expect(markup).toContain('data-appearance-popover="true"');
    expect(markup).not.toContain("<select");
  });
});
