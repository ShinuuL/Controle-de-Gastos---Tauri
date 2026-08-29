import { describe, expect, it } from "vitest";
import { parseGenericPdfLines } from "./genericPdf";
import { groupPdfVisualLines, type PdfTextItem } from "./pdfText";

/** Monta uma página com uma linha visual por texto, de cima para baixo. */
function page(...texts: string[]): PdfTextItem[] {
  return texts.map((text, index) => ({ x: 30, y: 700 - index * 20, text }));
}

function parse(...texts: string[]) {
  return parseGenericPdfLines(groupPdfVisualLines([page(...texts)]));
}

describe("parseGenericPdfLines", () => {
  it("lê extrato tabular com data, descrição, valor e saldo na mesma linha", () => {
    const parsed = parse(
      "Extrato de conta corrente 2026",
      "05/08/2026 PIX ENVIADO MERCADO CENTRAL -87,40 1.234,56",
      "06/08/2026 PIX RECEBIDO SALARIO 3.500,00 4.734,56",
    );

    expect(parsed.issues).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        sourceRow: 2,
        date: "2026-08-05",
        description: "PIX ENVIADO MERCADO CENTRAL",
        amount_cents: 8740,
        nature: "saida",
      },
      {
        sourceRow: 3,
        date: "2026-08-06",
        description: "PIX RECEBIDO SALARIO",
        amount_cents: 350000,
        nature: "entrada",
      },
    ]);
  });

  it("herda a data do cabeçalho de bloco quando o lançamento não a repete", () => {
    const parsed = parse(
      "Extrato de conta 2026",
      "01 AGO 2026",
      "Transferência enviada pelo Pix - Jessyca Moura R$ 14,00",
      "Transferência recebida pelo Pix - Gabriel Diniz R$ 15,00",
      "03 AGO 2026",
      "Compra no débito - LOJAS AMERICANAS R$ 18,48",
    );

    expect(parsed.rows).toEqual([
      {
        sourceRow: 3,
        date: "2026-08-01",
        description: "Transferência enviada pelo Pix - Jessyca Moura",
        amount_cents: 1400,
        nature: "saida",
      },
      {
        sourceRow: 4,
        date: "2026-08-01",
        description: "Transferência recebida pelo Pix - Gabriel Diniz",
        amount_cents: 1500,
        nature: "entrada",
      },
      {
        sourceRow: 6,
        date: "2026-08-03",
        description: "Compra no débito - LOJAS AMERICANAS",
        amount_cents: 1848,
        nature: "saida",
      },
    ]);
  });

  it("trata valor sem sinal como entrada quando o extrato marca débito com '-'", () => {
    // Convenção do PDF do Itaú: só o débito leva sinal. Sem essa leitura, um
    // "PIX TRANSF FULANO" recebido virava saída e invertia o resultado do mês.
    const parsed = parse(
      "12/08/2026 PIX TRANSF FULANO 64,00 1.000,00",
      "13/08/2026 PAY AUTO 40,00- 960,00",
    );

    expect(parsed.rows.map((row) => row.nature)).toEqual(["entrada", "saida"]);
  });

  it("cai na descrição quando o extrato não usa sinal em lugar nenhum", () => {
    const parsed = parse(
      "12/08/2026 Transferência recebida pelo Pix 64,00",
      "13/08/2026 Compra no débito PADARIA 40,00",
    );

    expect(parsed.rows.map((row) => row.nature)).toEqual(["entrada", "saida"]);
  });

  it("usa a coluna C/D quando o valor vem sem sinal", () => {
    const parsed = parse(
      "10/08/2026 TARIFA MENSALIDADE 30,00 D",
      "10/08/2026 ESTORNO TARIFA 30,00 C",
    );

    expect(parsed.rows.map((row) => row.nature)).toEqual(["saida", "entrada"]);
  });

  it("ignora linhas de saldo e linhas sem valor", () => {
    const parsed = parse(
      "05/08/2026 SALDO DO DIA 1.234,56",
      "05/08/2026 SALDO ANTERIOR 1.000,00",
      "05/08/2026 continuação da descrição sem valor",
    );

    expect(parsed.rows).toEqual([]);
    expect(parsed.issues).toEqual([]);
  });

  it("não cria lançamento a partir de número solto em extrato sem bloco de data", () => {
    const parsed = parse(
      "05/08/2026 PIX ENVIADO -50,00",
      "Agência 1234 Conta 56789,00",
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].description).toBe("PIX ENVIADO");
  });

  it("não confunde número de documento na descrição com o valor", () => {
    const parsed = parse("07/08/2026 BOLETO 34191790010104351004791020150008 -120,00");

    expect(parsed.rows).toEqual([
      {
        sourceRow: 1,
        date: "2026-08-07",
        description: "BOLETO 34191790010104351004791020150008",
        amount_cents: 12000,
        nature: "saida",
      },
    ]);
  });
});
