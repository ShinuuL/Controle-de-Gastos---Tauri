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
});
