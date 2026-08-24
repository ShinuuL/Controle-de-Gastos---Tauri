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
    expect(() => parseItauCsv(utf8("Data;Histórico;Valor\n01/01/2026;X;1,00"))).toThrow(/cabeçalho/i);
    expect(() => parseItauCsv(utf8("isso não é um CSV"))).toThrow(/formato/i);
  });

  it("limita tamanho a 5 MiB e dados a 10.000 linhas", () => {
    expect(() => parseItauCsv(new Uint8Array(5 * 1024 * 1024 + 1).buffer)).toThrow(/5 MiB/i);
    const rows = Array.from({ length: 10001 }, (_, index) => `01/01/2026;Linha ${index};1,00;C`);
    expect(() => parseItauCsv(utf8(`Data;Histórico;Valor;Tipo\n${rows.join("\n")}`))).toThrow(/10\.000/i);
  });
});
