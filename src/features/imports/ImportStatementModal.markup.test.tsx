import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ImportStatementModal from "./ImportStatementModal";
import type { ReconciliationConflict } from "./reconciliation";

const conflict: ReconciliationConflict = {
  sourceRow: 2,
  date: "2026-01-05",
  description: "Mercado Central Online SP",
  amount_cents: 1_250,
  nature: "saida",
  existing: {
    id: "expense-1",
    date: "2026-01-04",
    description: "Mercado",
    amount_cents: 1_250,
    nature: "saida",
  },
};

function renderModal(): string {
  return renderToStaticMarkup(
    <ImportStatementModal
      open
      fileName="extrato.csv"
      categories={[]}
      result={{ newRows: [], conflicts: [conflict], duplicates: [] }}
      issues={[]}
      submitting={false}
      error={null}
      onConfirm={async () => undefined}
      onClose={() => undefined}
    />,
  );
}

describe("marcação acessível da prévia de importação", () => {
  it("mantém no DOM um painel estável para cada aria-controls", () => {
    const markup = renderModal();
    const controlledIds = [...markup.matchAll(/aria-controls="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(controlledIds).toHaveLength(4);
    for (const id of controlledIds) {
      expect(markup).toContain(`id="${id}"`);
    }
  });

  it("abre na primeira tab não vazia e acionável", () => {
    const markup = renderModal();
    const selectedTab = markup.match(
      /<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>(.*?)<\/button>/,
    )?.[1];

    expect(selectedTab).toContain("Conflitos · 1");
  });

  it("mostra a movimentação já existente que motivou o conflito", () => {
    const markup = renderModal();

    expect(markup).toContain("Já existe uma movimentação parecida");
    expect(markup).toContain("Mercado");
    expect(markup).toContain("1 dia de diferença");
  });
});
