import { describe, expect, it } from "vitest";
import { groupPdfLines, parseItauPdfLines, type PdfTextItem } from "./itauPdf";

/**
 * Coordenadas medidas no extrato real (extrato/itau_extrato_072026.pdf): data
 * em x=30.6, lançamentos em x=95.8, valor alinhado à direita terminando em
 * x~458 e saldo a partir de x=515.
 */
const X = { date: 30.6, description: 95.8, amount: 424.5, balance: 533.8 };

const line = (
  y: number,
  parts: Partial<Record<keyof typeof X, string>>,
): PdfTextItem[] =>
  (Object.keys(parts) as Array<keyof typeof X>).map((column) => ({
    x: X[column],
    y,
    text: parts[column] as string,
  }));

describe("groupPdfLines", () => {
  it("agrupa fragmentos por altura e separa as quatro colunas", () => {
    const lines = groupPdfLines([
      [
        ...line(553.0, { date: "24/08/2026", description: "PAY Ailto 22/08", amount: "-50,00" }),
        ...line(571.7, { date: "25/08/2026", description: "SALDO DO DIA", balance: "-41,26" }),
      ],
    ]);

    expect(lines).toEqual([
      { sourceRow: 1, date: "25/08/2026", description: "SALDO DO DIA", amount: "", balance: "-41,26" },
      { sourceRow: 2, date: "24/08/2026", description: "PAY Ailto 22/08", amount: "-50,00", balance: "" },
    ]);
  });

  it("tolera desalinhamento vertical mínimo dentro da mesma linha", () => {
    const lines = groupPdfLines([
      [
        { x: X.date, y: 553.0, text: "24/08/2026" },
        { x: X.description, y: 551.4, text: "PAY Ailto 22/08" },
        { x: X.amount, y: 553.6, text: "-50,00" },
      ],
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ description: "PAY Ailto 22/08", amount: "-50,00" });
  });

  it("junta fragmentos da mesma coluna na ordem horizontal", () => {
    const lines = groupPdfLines([
      [
        { x: X.description + 60, y: 500, text: "BANCO PAN SA - AUTO PAN" },
        { x: X.description, y: 500, text: "PAG BOLETO" },
        { x: X.date, y: 500, text: "10/08/2026" },
      ],
    ]);

    expect(lines[0]?.description).toBe("PAG BOLETO BANCO PAN SA - AUTO PAN");
  });

  it("numera sourceRow continuamente através das páginas", () => {
    const lines = groupPdfLines([
      line(500, { date: "01/08/2026", description: "A", amount: "1,00" }),
      line(500, { date: "02/08/2026", description: "B", amount: "2,00" }),
    ]);

    expect(lines.map((item) => item.sourceRow)).toEqual([1, 2]);
  });
});

describe("parseItauPdfLines", () => {
  it("converte lançamentos usando o sinal do valor como natureza", () => {
    const parsed = parseItauPdfLines(
      groupPdfLines([
        [
          ...line(600, { date: "20/08/2026", description: "SISPAG PIX MASTERSYS GESTAO ...", amount: "120,00" }),
          ...line(580, { date: "20/08/2026", description: "PIX QRS KATATAUS LA20/08", amount: "-48,00" }),
          ...line(560, { date: "07/08/2026", description: "PIX TRANSF MASTERS07/08", amount: "1.525,42" }),
        ],
      ]),
    );

    expect(parsed.issues).toEqual([]);
    expect(parsed.rows).toEqual([
      { sourceRow: 1, date: "2026-08-20", description: "SISPAG PIX MASTERSYS GESTAO ...", amount_cents: 12000, nature: "entrada" },
      { sourceRow: 2, date: "2026-08-20", description: "PIX QRS KATATAUS LA20/08", amount_cents: 4800, nature: "saida" },
      { sourceRow: 3, date: "2026-08-07", description: "PIX TRANSF MASTERS07/08", amount_cents: 152542, nature: "entrada" },
    ]);
  });

  it("ignora saldo, cabeçalho e o aviso legal sem gerar issues", () => {
    const parsed = parseItauPdfLines(
      groupPdfLines([
        [
          ...line(600, { date: "data", description: "lançamentos", amount: "valor (R$)", balance: "saldo (R$)" }),
          ...line(580, { date: "25/08/2026", description: "SALDO DO DIA", balance: "-41,26" }),
          ...line(560, { date: "período de visualização: 26/07/2026 até 25/08/2026" }),
          ...line(540, { date: "Aviso! Os saldos acima são baseados nas informações disponíveis." }),
        ],
      ]),
    );

    expect(parsed).toEqual({ rows: [], issues: [] });
  });

  it("registra issue quando a linha tem data e valor ilegível", () => {
    const parsed = parseItauPdfLines(
      groupPdfLines([line(600, { date: "10/08/2026", description: "PAY GIRO", amount: "R$ ??" })]),
    );

    expect(parsed.rows).toEqual([]);
    expect(parsed.issues).toEqual([{ sourceRow: 1, message: "Valor inválido" }]);
  });
});
