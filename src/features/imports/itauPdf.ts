import {
  isBalanceDescription,
  parseSignedAmount,
  parseStatementDate,
  type ParsedStatement,
  type ParsedStatementRow,
  type StatementIssue,
} from "./statementValues";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10_000;

/** Um fragmento de texto do PDF, na origem do pdf.js (y cresce para cima). */
export interface PdfTextItem {
  x: number;
  y: number;
  text: string;
}

/**
 * O extrato do Itaú é uma tabela de quatro colunas posicionadas por x. Os
 * limites ficam nos vãos entre elas: data começa em ~30, lançamentos em ~96,
 * valor termina em ~458 e saldo começa em ~515. Ler por coordenada (e não por
 * texto linearizado) é o que impede o valor de uma linha ser atribuído à
 * seguinte quando a descrição é longa.
 */
const DESCRIPTION_MIN_X = 90;
const AMOUNT_MIN_X = 400;
const BALANCE_MIN_X = 490;

/** Fragmentos dentro dessa distância vertical pertencem à mesma linha. */
const LINE_TOLERANCE_Y = 2;

export interface PdfStatementLine {
  sourceRow: number;
  date: string;
  description: string;
  amount: string;
  balance: string;
}

function joinFragments(items: PdfTextItem[]): string {
  return items
    .sort((left, right) => left.x - right.x)
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Agrupa os fragmentos de cada página em linhas visuais e distribui cada um
 * entre as quatro colunas. `sourceRow` é contado sobre o documento inteiro para
 * que a prévia consiga apontar a linha mesmo em extratos de várias páginas.
 */
export function groupPdfLines(pages: PdfTextItem[][]): PdfStatementLine[] {
  const lines: PdfStatementLine[] = [];
  let sourceRow = 0;

  for (const page of pages) {
    const buckets: Array<{ y: number; items: PdfTextItem[] }> = [];
    for (const item of page) {
      if (!item.text.trim()) continue;
      const bucket = buckets.find((candidate) => Math.abs(candidate.y - item.y) <= LINE_TOLERANCE_Y);
      if (bucket) bucket.items.push(item);
      else buckets.push({ y: item.y, items: [item] });
    }

    buckets.sort((left, right) => right.y - left.y);
    for (const bucket of buckets) {
      sourceRow += 1;
      lines.push({
        sourceRow,
        date: joinFragments(bucket.items.filter((item) => item.x < DESCRIPTION_MIN_X)),
        description: joinFragments(
          bucket.items.filter((item) => item.x >= DESCRIPTION_MIN_X && item.x < AMOUNT_MIN_X),
        ),
        amount: joinFragments(
          bucket.items.filter((item) => item.x >= AMOUNT_MIN_X && item.x < BALANCE_MIN_X),
        ),
        balance: joinFragments(bucket.items.filter((item) => item.x >= BALANCE_MIN_X)),
      });
    }
  }

  return lines;
}

/**
 * Converte as linhas visuais em lançamentos. Só linhas cuja primeira coluna é
 * uma data entram na conta -- cabeçalho, dados do titular e o aviso legal da
 * última página caem fora sem virar issue, porque não são lançamentos com
 * defeito, são outra coisa.
 */
export function parseItauPdfLines(lines: PdfStatementLine[]): ParsedStatement {
  const rows: ParsedStatementRow[] = [];
  const issues: StatementIssue[] = [];

  for (const line of lines) {
    const date = parseStatementDate(line.date);
    if (!date) continue;
    if (isBalanceDescription(line.description)) continue;
    // Linha com saldo e sem valor é fechamento de dia sem lançamento próprio.
    if (!line.amount) continue;

    const amount = parseSignedAmount(line.amount);
    if (!line.description) {
      issues.push({ sourceRow: line.sourceRow, message: "Descrição inválida" });
    } else if (amount === null) {
      issues.push({ sourceRow: line.sourceRow, message: "Valor inválido" });
    } else {
      rows.push({
        sourceRow: line.sourceRow,
        date,
        description: line.description,
        amount_cents: amount.amount_cents,
        nature: amount.nature,
      });
    }
  }

  return { rows, issues };
}

async function extractPdfPages(bytes: ArrayBuffer): Promise<PdfTextItem[][]> {
  // Importado sob demanda: o pdf.js é grande e só o caminho de PDF precisa dele.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  try {
    const pages: PdfTextItem[][] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .filter((item): item is Extract<typeof item, { str: string }> => "str" in item)
          .map((item) => ({ x: item.transform[4], y: item.transform[5], text: item.str })),
      );
      page.cleanup();
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

export async function parseItauPdf(bytes: ArrayBuffer): Promise<ParsedStatement> {
  if (bytes.byteLength === 0) throw new Error("Arquivo PDF vazio");
  if (bytes.byteLength > MAX_BYTES) throw new Error("Arquivo PDF excede o limite de 5 MiB");

  let pages: PdfTextItem[][];
  try {
    pages = await extractPdfPages(bytes);
  } catch {
    throw new Error("Não foi possível ler o PDF. Ele pode estar protegido por senha ou corrompido.");
  }

  const lines = groupPdfLines(pages);
  if (lines.length > MAX_ROWS) throw new Error("Arquivo PDF excede o limite de 10.000 linhas");

  const parsed = parseItauPdfLines(lines);
  if (parsed.rows.length === 0 && parsed.issues.length === 0) {
    throw new Error(
      "Nenhum lançamento encontrado no PDF. Confirme que é o extrato de conta corrente do Itaú.",
    );
  }
  return parsed;
}
