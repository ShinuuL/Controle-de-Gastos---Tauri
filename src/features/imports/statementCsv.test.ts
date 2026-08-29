import { describe, expect, it } from "vitest";
import { detectCsvBank, parseStatementCsv } from "./statementCsv";

const utf8 = (value: string): ArrayBuffer =>
  new TextEncoder().encode(value).buffer as ArrayBuffer;

describe("detectCsvBank", () => {
  it.each([
    ["app do Itaú", "data;lancamentos;valor (R$);saldo (R$)", "itau"],
    ["internet banking do Itaú", "Data;Histórico;Valor;Tipo", "itau"],
    ["Nubank", "Data,Valor,Identificador,Descrição", "nubank"],
  ])("reconhece o cabeçalho do %s", (_nome, header, esperado) => {
    expect(detectCsvBank(header)).toBe(esperado);
  });

  it("ignora linhas em branco antes do cabeçalho", () => {
    expect(detectCsvBank("\n\nData,Valor,Identificador,Descrição")).toBe("nubank");
  });

  it("não se confunde com vírgula em descrição na linha de dados", () => {
    const texto = [
      "data;lancamentos;valor (R$);saldo (R$)",
      "26/08/2026;PAY ATACA, LTDA 26/08;-8,45;",
    ].join("\n");

    expect(detectCsvBank(texto)).toBe("itau");
  });
});

describe("parseStatementCsv", () => {
  it("roteia o extrato do Nubank para o parser de decimal com ponto", () => {
    const parsed = parseStatementCsv(
      utf8("Data,Valor,Identificador,Descrição\n06/08/2026,1302.48,abc,Pix recebido"),
    );

    expect(parsed.bank).toBe("nubank");
    expect(parsed.rows[0]).toMatchObject({ amount_cents: 130248, nature: "entrada" });
  });

  it("roteia o extrato do Itaú para o parser de decimal com vírgula", () => {
    const parsed = parseStatementCsv(
      utf8("data;lancamentos;valor (R$);saldo (R$)\n07/08/2026;PIX TRANSF MASTERS07/08;1.525,42;"),
    );

    expect(parsed.bank).toBe("itau");
    expect(parsed.rows[0]).toMatchObject({ amount_cents: 152542, nature: "entrada" });
  });

  it("o mesmo texto de valor é lido diferente conforme o banco", () => {
    // "1.234" vale mil duzentos e trinta e quatro no Itaú. No Nubank o ponto é
    // decimal, entao um valor assim nao passa pelo parser do Nubank.
    const itau = parseStatementCsv(utf8("Data;Histórico;Valor;Tipo\n06/08/2026;X;1.234;C"));
    expect(itau.rows[0]).toMatchObject({ amount_cents: 123400 });

    const nubank = parseStatementCsv(utf8("Data,Valor,Identificador,Descrição\n06/08/2026,1.234,abc,X"));
    expect(nubank.rows).toEqual([]);
    expect(nubank.issues).toEqual([{ sourceRow: 2, message: "Valor inválido" }]);
  });
});
