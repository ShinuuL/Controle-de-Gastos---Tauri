import { describe, expect, it } from "vitest";
import { parseItauCsv } from "./itauCsv";

const utf8 = (value: string): ArrayBuffer => new TextEncoder().encode(value).buffer;

describe("parseItauCsv", () => {
  it("converte uma linha de entrada do Itaú em centavos e data ISO", () => {
    const parsed = parseItauCsv(utf8("Data;Histórico;Valor;Tipo\n05/01/2026;PIX RECEBIDO;7.500,00;C"));

    expect(parsed).toEqual({
      rows: [
        {
          sourceRow: 2,
          date: "2026-01-05",
          description: "PIX RECEBIDO",
          amount_cents: 750000,
          nature: "entrada",
        },
      ],
      issues: [],
    });
  });

  it("decodifica Windows-1252, campos entre aspas e categoria opcional", () => {
    const bytes = Uint8Array.from([
      0x44, 0x61, 0x74, 0x61, 0x3b, 0x48, 0x69, 0x73, 0x74, 0xf3, 0x72, 0x69, 0x63, 0x6f, 0x3b,
      0x56, 0x61, 0x6c, 0x6f, 0x72, 0x3b, 0x54, 0x69, 0x70, 0x6f, 0x3b, 0x43, 0x61, 0x74, 0x65, 0x67,
      0x6f, 0x72, 0x69, 0x61, 0x0d, 0x0a, 0x30, 0x36, 0x2f, 0x30, 0x31, 0x2f, 0x32, 0x30, 0x32, 0x36,
      0x3b, 0x22, 0x50, 0x61, 0x67, 0x61, 0x6d, 0x65, 0x6e, 0x74, 0x6f, 0x3b, 0x20, 0x63, 0x72, 0xe9, 0x64,
      0x69, 0x74, 0x6f, 0x22, 0x3b, 0x31, 0x30, 0x2c, 0x30, 0x30, 0x3b, 0x44, 0x3b, 0x41, 0x6c,
      0x69, 0x6d, 0x65, 0x6e, 0x74, 0x61, 0xe7, 0xe3, 0x6f,
    ]);
    const parsed = parseItauCsv(bytes.buffer);

    expect(parsed.rows[0]).toMatchObject({
      sourceRow: 2,
      date: "2026-01-06",
      description: "Pagamento; crédito",
      amount_cents: 1000,
      nature: "saida",
      suggestedCategoryName: "Alimentação",
    });
  });

  it("aceita o alias Lançamento e mantém linhas válidas ao lado de inválidas", () => {
    const parsed = parseItauCsv(utf8([
      "Data;Lançamento;Valor;Tipo",
      "05/01/2026;Entrada;10,00;C",
      "31/02/2026;Data inválida;10,00;C",
    ].join("\n")));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.issues).toMatchObject([{ sourceRow: 3, message: expect.stringContaining("Data") }]);
  });

  it("preserva a linha física após linha vazia e registro citado multilinha", () => {
    const parsed = parseItauCsv(utf8([
      "Data;Histórico;Valor;Tipo",
      "",
      '05/01/2026;"Descrição\ncontinua";10,00;C',
      "31/02/2026;Data inválida;10,00;C",
    ].join("\n")));

    expect(parsed.rows[0]?.sourceRow).toBe(3);
    expect(parsed.issues).toEqual([{ sourceRow: 5, message: "Data inválida" }]);
  });

  it.each([
    ["data inválida", "32/01/2026;Teste;10,00;C", "data"],
    ["valor inválido", "01/01/2026;Teste;abc;C", "valor"],
    ["tipo inválido", "01/01/2026;Teste;10,00;X", "tipo"],
  ])("registra issue para %s", (_name, row, text) => {
    const parsed = parseItauCsv(utf8(`Data;Histórico;Valor;Tipo\n${row}`));
    expect(parsed.rows).toEqual([]);
    expect(parsed.issues[0]?.message.toLowerCase()).toContain(text);
  });

  it("rejeita arquivo vazio, cabeçalho ausente e formato não suportado", () => {
    expect(() => parseItauCsv(utf8("  \r\n"))).toThrow("Arquivo CSV vazio");
    expect(() => parseItauCsv(utf8("Data;Histórico\n01/01/2026;X"))).toThrow(/cabeçalho/i);
    expect(() => parseItauCsv(utf8("isso não é um CSV"))).toThrow(/formato/i);
  });

  it("limita tamanho a 5 MiB e dados a 10.000 linhas", () => {
    expect(() => parseItauCsv(new Uint8Array(5 * 1024 * 1024 + 1).buffer)).toThrow(/5 MiB/i);
    const rows = Array.from({ length: 10001 }, (_, index) => `01/01/2026;Linha ${index};1,00;C`);
    expect(() => parseItauCsv(utf8(`Data;Histórico;Valor;Tipo\n${rows.join("\n")}`))).toThrow(/10\.000/i);
  });
});

describe("parseItauCsv com o extrato exportado pelo app do Itaú", () => {
  // Cabeçalho e linhas reproduzidos de extrato/itau_extrato_072026.csv.
  const appCsv = [
    "data;lancamentos;valor (R$);saldo (R$)",
    "27/08/2026;SALDO DO DIA;;-49,71",
    "26/08/2026;PAY ATACA 26/08;-8,45;",
    "20/08/2026;SISPAG PIX MASTERSYS GESTAO ...;120,00;",
    "07/08/2026;PIX TRANSF MASTERS07/08;1.525,42;",
    "04/08/2026;IOF;-0,37;",
  ].join("\n");

  it("deriva a natureza do sinal quando não existe coluna Tipo", () => {
    const parsed = parseItauCsv(utf8(appCsv));

    expect(parsed.issues).toEqual([]);
    expect(parsed.rows).toEqual([
      { sourceRow: 3, date: "2026-08-26", description: "PAY ATACA 26/08", amount_cents: 845, nature: "saida" },
      { sourceRow: 4, date: "2026-08-20", description: "SISPAG PIX MASTERSYS GESTAO ...", amount_cents: 12000, nature: "entrada" },
      { sourceRow: 5, date: "2026-08-07", description: "PIX TRANSF MASTERS07/08", amount_cents: 152542, nature: "entrada" },
      { sourceRow: 6, date: "2026-08-04", description: "IOF", amount_cents: 37, nature: "saida" },
    ]);
  });

  it("descarta linhas de saldo sem registrá-las como issue", () => {
    const parsed = parseItauCsv(utf8([
      "data;lancamentos;valor (R$);saldo (R$)",
      "27/08/2026;SALDO DO DIA;;-49,71",
      "27/08/2026;SALDO ANTERIOR;;-10,00",
      "27/08/2026;SALDO TOTAL DISPONÍVEL DIA;;5,00",
    ].join("\n")));

    expect(parsed).toEqual({ rows: [], issues: [] });
  });

  it("não confunde a coluna saldo (R$) com a coluna de valor", () => {
    const parsed = parseItauCsv(utf8([
      "data;lancamentos;valor (R$);saldo (R$)",
      "21/08/2026;PIX QRS REDE LUCAS21/08;-8,99;1.406,42",
    ].join("\n")));

    expect(parsed.rows[0]).toMatchObject({ amount_cents: 899, nature: "saida" });
  });

  it("ainda respeita a coluna Tipo quando ela existe, mesmo com valor sem sinal", () => {
    const parsed = parseItauCsv(utf8("Data;Histórico;Valor;Tipo\n05/01/2026;Compra;10,00;D"));

    expect(parsed.rows[0]).toMatchObject({ amount_cents: 1000, nature: "saida" });
  });
});
