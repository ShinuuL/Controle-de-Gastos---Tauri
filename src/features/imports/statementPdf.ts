import { parseGenericPdfLines } from "./genericPdf";
import { groupPdfLines, parseItauPdfLines } from "./itauPdf";
import {
  groupPdfVisualLines,
  MAX_PDF_LINES,
  readPdfPages,
  type PdfTextItem,
} from "./pdfText";
import { normalizeAccents, type ParsedStatement } from "./statementValues";

export type PdfBank = "itau" | "nubank" | "generico";

export const PDF_BANK_LABEL: Record<PdfBank, string> = {
  itau: "Itaú",
  nubank: "Nubank",
  generico: "genérico",
};

/**
 * Reconhece o banco pelo texto do documento inteiro. Só o Itaú tem parser
 * próprio (posicional, calibrado nas colunas dele); os demais caem no parser
 * genérico. Identificar o Nubank ainda assim vale pela mensagem de erro, que
 * precisa dizer qual arquivo o usuário abriu quando nada é reconhecido.
 *
 * A varredura é do documento todo, e não só da primeira página: no extrato real
 * do Itaú a marca não aparece na primeira página -- ela abre com os dados do
 * titular e os saldos, e o nome do banco só surge no rodapé das seguintes.
 */
export function detectPdfBank(pages: PdfTextItem[][]): PdfBank {
  const text = normalizeAccents(
    pages.flat().map((item) => item.text).join(" "),
  ).toLowerCase();
  if (/\bitau\b|itau unibanco|extrato conta \/ lancamentos/.test(text)) {
    return "itau";
  }
  if (/\bnubank\b|nu pagamentos|nu financeira/.test(text)) return "nubank";
  return "generico";
}

function hasContent(parsed: ParsedStatement): boolean {
  return parsed.rows.length > 0 || parsed.issues.length > 0;
}

export interface ParsedPdfStatement extends ParsedStatement {
  bank: PdfBank;
}

/**
 * Lê o extrato em PDF de qualquer banco.
 *
 * O parser posicional do Itaú roda primeiro quando o documento é dele, porque
 * separar as colunas por coordenada é mais confiável que qualquer heurística de
 * texto. Se ele não achar nada -- outro layout do mesmo banco, por exemplo --,
 * o parser genérico ainda tem chance antes de o app desistir.
 */
export async function parseStatementPdf(
  bytes: ArrayBuffer,
): Promise<ParsedPdfStatement> {
  const pages = await readPdfPages(bytes);
  const bank = detectPdfBank(pages);

  if (bank === "itau") {
    const lines = groupPdfLines(pages);
    if (lines.length > MAX_PDF_LINES) {
      throw new Error("Arquivo PDF excede o limite de 10.000 linhas");
    }
    const parsed = parseItauPdfLines(lines);
    if (hasContent(parsed)) return { ...parsed, bank };
  }

  const visualLines = groupPdfVisualLines(pages);
  if (visualLines.length > MAX_PDF_LINES) {
    throw new Error("Arquivo PDF excede o limite de 10.000 linhas");
  }
  const parsed = parseGenericPdfLines(visualLines);
  if (hasContent(parsed)) return { ...parsed, bank };

  throw new Error(
    "Nenhum lançamento encontrado no PDF. Confirme que é o extrato da conta (e não a fatura do cartão) e, se o problema continuar, importe o mesmo período em CSV.",
  );
}
