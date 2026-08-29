import { describe, expect, it } from "vitest";
import { detectPdfBank } from "./statementPdf";
import type { PdfTextItem } from "./pdfText";

function page(...texts: string[]): PdfTextItem[] {
  return texts.map((text, index) => ({ x: 30, y: 700 - index * 20, text }));
}

describe("detectPdfBank", () => {
  it("reconhece o Itaú mesmo quando a marca só aparece em página posterior", () => {
    // O extrato real abre com titular e saldos; "Itaú" só surge no rodapé das
    // páginas seguintes. Olhar apenas a primeira página mandava o arquivo para
    // o parser genérico.
    const pages = [
      page("GABRIEL GARCIA FERREIRA", "agência: 4365 conta: 067609-9"),
      page("Banco Itaú Unibanco S.A. — CNPJ 60.701.190/0001-04"),
    ];

    expect(detectPdfBank(pages)).toBe("itau");
  });

  it("reconhece o Itaú pelo título do extrato", () => {
    expect(detectPdfBank([page("extrato conta / lançamentos")])).toBe("itau");
  });

  it("reconhece o Nubank", () => {
    expect(detectPdfBank([page("Nubank", "Extrato de conta")])).toBe("nubank");
  });

  it("cai no genérico quando nenhuma marca é reconhecida", () => {
    expect(detectPdfBank([page("Extrato de conta corrente")])).toBe("generico");
  });
});
