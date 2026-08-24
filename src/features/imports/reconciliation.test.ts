import { describe, expect, it } from "vitest";
import type { ParsedStatementRow } from "./itauCsv";
import { normalizeDescription, reconcileStatement, reconciliationKey } from "./reconciliation";

const row = (overrides: Partial<ParsedStatementRow> = {}): ParsedStatementRow => ({
  sourceRow: 2,
  date: "2026-01-05",
  description: "Pagamento cartão",
  amount_cents: 1250,
  nature: "saida",
  ...overrides,
});

describe("reconciliação de extrato", () => {
  it("normaliza descrição e gera chave exata sem alterar o texto de exibição", () => {
    const statementRow = row({ description: "  PAGAMENTO\u00a0cartão  " });

    expect(normalizeDescription(statementRow.description)).toBe("pagamento cartao");
    expect(reconciliationKey(statementRow)).toBe("2026-01-05|saida|1250|pagamento cartao");
    expect(statementRow.description).toBe("  PAGAMENTO\u00a0cartão  ");
  });

  it("classifica como duplicata uma linha igual já existente apesar de caixa, acentos e espaços", () => {
    const uploaded = row({ description: "  PAGAMENTO\u00a0cartão  " });
    const existing = [{ id: "expense-1", ...row({ description: "pagamento cartao" }) }];

    expect(reconcileStatement([uploaded], existing)).toEqual({
      newRows: [],
      duplicates: [uploaded],
      conflicts: [],
    });
  });

  it("classifica a segunda linha idêntica do próprio CSV como duplicata", () => {
    const first = row({ sourceRow: 2 });
    const second = row({ sourceRow: 3, description: "PAGAMENTO   CARTÃO" });

    expect(reconcileStatement([first, second], [])).toEqual({
      newRows: [first],
      duplicates: [second],
      conflicts: [],
    });
  });

  it("mantém como novas linhas que diferem em valor ou data", () => {
    const base = row();
    const differentAmount = row({ sourceRow: 3, amount_cents: 1251 });
    const differentDate = row({ sourceRow: 4, date: "2026-01-06" });

    expect(reconcileStatement([differentAmount, differentDate], [{ id: "expense-1", ...base }])).toEqual({
      newRows: [differentAmount, differentDate],
      duplicates: [],
      conflicts: [],
    });
  });

  it("classifica descrições muito semelhantes de mesmo valor como conflitos e não as inclui em novas", () => {
    const uploaded = row({ description: "Mercado Central Online SP" });
    const existing = [{ id: "expense-1", ...row({ description: "Mercado Central Online" }) }];

    expect(reconcileStatement([uploaded], existing)).toEqual({
      newRows: [],
      duplicates: [],
      conflicts: [uploaded],
    });
  });

  it("classifica a repetição de uma linha em conflito como duplicata interna", () => {
    const conflict = row({ sourceRow: 2, description: "Mercado Central Online SP" });
    const repeatedConflict = row({ sourceRow: 3, description: "MERCADO CENTRAL ONLINE SP" });
    const existing = [{ id: "expense-1", ...row({ description: "Mercado Central Online" }) }];

    expect(reconcileStatement([conflict, repeatedConflict], existing)).toEqual({
      newRows: [],
      duplicates: [repeatedConflict],
      conflicts: [conflict],
    });
  });

  it("mantém registros de mesmo valor com descrições sem relação como novos", () => {
    const uploaded = row({ description: "Farmácia Popular" });
    const existing = [{ id: "expense-1", ...row({ description: "Mercado Central" }) }];

    expect(reconcileStatement([uploaded], existing)).toEqual({
      newRows: [uploaded],
      duplicates: [],
      conflicts: [],
    });
  });
});
