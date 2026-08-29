import { describe, expect, it } from "vitest";
import { parseNubankCsv } from "./nubankCsv";

const utf8 = (value: string): ArrayBuffer =>
  new TextEncoder().encode(value).buffer as ArrayBuffer;

const HEADER = "Data,Valor,Identificador,Descrição";

describe("parseNubankCsv", () => {
  it("lê o extrato real com decimal em ponto e sinal no valor", () => {
    // Linhas reproduzidas de extrato/NU_194113298_01AGO2026_27AGO2026.csv.
    const parsed = parseNubankCsv(
      utf8(
        [
          HEADER,
          "01/08/2026,14.00,6a6e2b03-7712-4abd-a911-dd72bb1cf657,Transferência recebida pelo Pix - GABRIEL DINIZ MAGALHAES",
          "03/08/2026,-13.12,6a7108ed-9450-4d42-89a0-e818aabd2c4d,Transferência enviada pelo Pix - 99 TECNOLOGIA LTDA",
          "06/08/2026,1302.48,6a74d518-2a78-4ae0-bd8b-44e62f5f48fa,Transferência recebida pelo Pix - A T S CONTABILIDADE LTDA",
          "06/08/2026,-18.48,6a74fdff-f0dd-4037-bc4f-f5c309ca7a49,Compra no débito - LOJAS AMERICANAS 1331",
        ].join("\n"),
      ),
    );

    expect(parsed.issues).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        sourceRow: 2,
        date: "2026-08-01",
        description: "Transferência recebida pelo Pix - GABRIEL DINIZ MAGALHAES",
        amount_cents: 1400,
        nature: "entrada",
      },
      {
        sourceRow: 3,
        date: "2026-08-03",
        description: "Transferência enviada pelo Pix - 99 TECNOLOGIA LTDA",
        amount_cents: 1312,
        nature: "saida",
      },
      {
        sourceRow: 4,
        date: "2026-08-06",
        description: "Transferência recebida pelo Pix - A T S CONTABILIDADE LTDA",
        amount_cents: 130248,
        nature: "entrada",
      },
      {
        sourceRow: 5,
        date: "2026-08-06",
        description: "Compra no débito - LOJAS AMERICANAS 1331",
        amount_cents: 1848,
        nature: "saida",
      },
    ]);
  });

  it("preserva vírgula dentro de descrição entre aspas", () => {
    const parsed = parseNubankCsv(
      utf8(`${HEADER}\n06/08/2026,-30.00,abc,"Compra no débito - CENTER PLAZA, LTDA"`),
    );

    expect(parsed.rows[0]).toMatchObject({
      description: "Compra no débito - CENTER PLAZA, LTDA",
      amount_cents: 3000,
      nature: "saida",
    });
  });

  it("não interpreta o formato brasileiro de valor", () => {
    // "1.302,48" no arquivo do Nubank seria dado corrompido, nao 1302,48.
    const parsed = parseNubankCsv(utf8(`${HEADER}\n06/08/2026,"1.302,48",abc,Suspeito`));

    expect(parsed.rows).toEqual([]);
    expect(parsed.issues).toEqual([{ sourceRow: 2, message: "Valor inválido" }]);
  });

  it("registra issue por linha inválida sem descartar as boas", () => {
    const parsed = parseNubankCsv(
      utf8(
        [
          HEADER,
          "31/02/2026,10.00,abc,Data impossível",
          "06/08/2026,10.00,def,Compra válida",
          "07/08/2026,abc,ghi,Valor ilegível",
        ].join("\n"),
      ),
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ description: "Compra válida" });
    expect(parsed.issues).toEqual([
      { sourceRow: 2, message: "Data inválida" },
      { sourceRow: 4, message: "Valor inválido" },
    ]);
  });

  it("rejeita cabeçalho sem as colunas obrigatórias", () => {
    expect(() => parseNubankCsv(utf8("Data,Valor\n01/08/2026,10.00"))).toThrow(/cabeçalho/i);
  });

  it("aplica os mesmos limites de tamanho do leitor CSV", () => {
    expect(() => parseNubankCsv(new ArrayBuffer(0))).toThrow("Arquivo CSV vazio");
    expect(() => parseNubankCsv(new ArrayBuffer(5 * 1024 * 1024 + 1))).toThrow(/5 MiB/i);
  });
});
