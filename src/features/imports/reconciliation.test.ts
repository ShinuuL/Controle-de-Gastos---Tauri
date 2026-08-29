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

  it("mantém como nova a linha que difere no valor, e acusa conflito na que só difere na data", () => {
    // Valor diferente é outro lançamento. Data próxima com o mesmo valor é a
    // defasagem entre a data da compra e a da liquidação -- suspeita, não certeza.
    const existing = { id: "expense-1", ...row() };
    const differentAmount = row({ sourceRow: 3, amount_cents: 1251 });
    const differentDate = row({ sourceRow: 4, date: "2026-01-06" });

    expect(reconcileStatement([differentAmount, differentDate], [existing])).toEqual({
      newRows: [differentAmount],
      duplicates: [],
      conflicts: [{ ...differentDate, existing }],
    });
  });

  it("classifica descrições muito semelhantes de mesmo valor como conflitos e não as inclui em novas", () => {
    const uploaded = row({ description: "Mercado Central Online SP" });
    const existing = { id: "expense-1", ...row({ description: "Mercado Central Online" }) };

    expect(reconcileStatement([uploaded], [existing])).toEqual({
      newRows: [],
      duplicates: [],
      conflicts: [{ ...uploaded, existing }],
    });
  });

  it("classifica a repetição de uma linha em conflito como duplicata interna", () => {
    const conflict = row({ sourceRow: 2, description: "Mercado Central Online SP" });
    const repeatedConflict = row({ sourceRow: 3, description: "MERCADO CENTRAL ONLINE SP" });
    const existing = { id: "expense-1", ...row({ description: "Mercado Central Online" }) };

    expect(reconcileStatement([conflict, repeatedConflict], [existing])).toEqual({
      newRows: [],
      duplicates: [repeatedConflict],
      conflicts: [{ ...conflict, existing }],
    });
  });

  it("acusa conflito com lançamento digitado à mão, mesmo sem nenhuma palavra em comum", () => {
    // O caso que motivou a regra: o mesmo gasto entrava duas vezes porque a
    // descrição digitada não se parece com a do banco.
    const uploaded = row({
      description: "Transferência enviada pelo Pix - 99 TECNOLOGIA LTDA - BANCO BTG PACTUAL",
    });
    const existing = { id: "expense-1", ...row({ description: "Uber" }) };

    expect(reconcileStatement([uploaded], [existing])).toEqual({
      newRows: [],
      duplicates: [],
      conflicts: [{ ...uploaded, existing }],
    });
  });

  it("acusa conflito dentro da janela de dias e ignora fora dela", () => {
    const existing = { id: "expense-1", ...row({ date: "2026-01-05", description: "Uber" }) };
    const dentro = row({ sourceRow: 2, date: "2026-01-08", description: "PIX 99 TECNOLOGIA" });
    const fora = row({ sourceRow: 3, date: "2026-01-09", description: "PIX 99 TECNOLOGIA" });

    const result = reconcileStatement([dentro, fora], [existing]);

    expect(result.conflicts).toEqual([{ ...dentro, existing }]);
    expect(result.newRows).toEqual([fora]);
  });

  it("descarta como duplicata a linha já importada pelo identificador do banco", () => {
    const uploaded = row({
      date: "2026-02-20",
      description: "Compra no débito - PADARIA",
      externalId: "nubank:6a6e2b03-7712-4abd-a911-dd72bb1cf657",
    });
    const existing = {
      id: "expense-1",
      date: "2026-02-20",
      description: "outra descrição qualquer",
      amount_cents: 1250,
      nature: "saida" as const,
      import_fingerprint: "nubank:6a6e2b03-7712-4abd-a911-dd72bb1cf657",
    };

    expect(reconcileStatement([uploaded], [existing])).toEqual({
      newRows: [],
      duplicates: [uploaded],
      conflicts: [],
    });
  });

  it("mantém como novas duas linhas iguais do mesmo extrato quando o banco dá identificador a cada uma", () => {
    // Duas transferências recebidas de R$ 15,00 no mesmo dia existem de verdade
    // no extrato do Nubank; só o identificador as distingue.
    const first = row({ sourceRow: 2, description: "Pix recebido", externalId: "nubank:a" });
    const second = row({ sourceRow: 3, description: "Pix recebido", externalId: "nubank:b" });

    expect(reconcileStatement([first, second], [])).toEqual({
      newRows: [first, second],
      duplicates: [],
      conflicts: [],
    });
  });
});
