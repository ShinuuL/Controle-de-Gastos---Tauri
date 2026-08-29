import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import Modal from "./Modal";

describe("Modal", () => {
  test("centraliza o diálogo e limita sua altura com rolagem interna", () => {
    const markup = renderToStaticMarkup(
      <Modal open onClose={() => undefined} title="Nova movimentação">
        <p>Conteúdo</p>
      </Modal>,
    );

    expect(markup).toContain("items-center");
    expect(markup).toContain("max-h-[calc(100dvh-2rem)]");
    expect(markup).toContain("overflow-y-auto");
    expect(markup).not.toContain("items-end");
  });

  test("mantém o título fixo e só o conteúdo rolando", () => {
    const markup = renderToStaticMarkup(
      <Modal open onClose={() => undefined} title="Nova movimentação">
        <p>Conteúdo</p>
      </Modal>,
    );

    // O cabeçalho não pode rolar junto: com a roda de cores dentro, o corpo
    // passa a rolar e o título precisa continuar visível.
    expect(markup).toContain("border-b border-border");
    expect(markup).toContain("shrink-0");
    expect(markup).toContain("env(safe-area-inset-bottom)");
  });
});
