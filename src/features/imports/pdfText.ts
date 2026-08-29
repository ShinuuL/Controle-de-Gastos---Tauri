/**
 * Leitura bruta de PDF compartilhada pelos parsers de extrato.
 *
 * Fica separada dos parsers porque o pdf.js é caro de carregar e os testes
 * precisam exercitar o agrupamento em linhas sem abrir PDF nenhum: os parsers
 * recebem linhas visuais já prontas.
 */

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_LINES = 10_000;

/** Um fragmento de texto do PDF, na origem do pdf.js (y cresce para cima). */
export interface PdfTextItem {
  x: number;
  y: number;
  text: string;
}

/** Uma linha visual do documento, com os fragmentos ordenados da esquerda para a direita. */
export interface PdfVisualLine {
  sourceRow: number;
  items: PdfTextItem[];
  text: string;
}

/** Fragmentos dentro dessa distância vertical pertencem à mesma linha. */
export const LINE_TOLERANCE_Y = 2;

export function joinFragments(items: PdfTextItem[]): string {
  return items
    .slice()
    .sort((left, right) => left.x - right.x)
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Agrupa os fragmentos de cada página em linhas visuais. `sourceRow` é contado
 * sobre o documento inteiro para que a prévia consiga apontar a linha mesmo em
 * extratos de várias páginas.
 */
export function groupPdfVisualLines(pages: PdfTextItem[][]): PdfVisualLine[] {
  const lines: PdfVisualLine[] = [];
  let sourceRow = 0;

  for (const page of pages) {
    const buckets: Array<{ y: number; items: PdfTextItem[] }> = [];
    for (const item of page) {
      if (!item.text.trim()) continue;
      const bucket = buckets.find(
        (candidate) => Math.abs(candidate.y - item.y) <= LINE_TOLERANCE_Y,
      );
      if (bucket) bucket.items.push(item);
      else buckets.push({ y: item.y, items: [item] });
    }

    buckets.sort((left, right) => right.y - left.y);
    for (const bucket of buckets) {
      sourceRow += 1;
      const items = bucket.items
        .slice()
        .sort((left, right) => left.x - right.x);
      lines.push({ sourceRow, items, text: joinFragments(items) });
    }
  }

  return lines;
}

export async function extractPdfPages(
  bytes: ArrayBuffer,
): Promise<PdfTextItem[][]> {
  // Importado sob demanda: o pdf.js é grande e só o caminho de PDF precisa dele.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes) })
    .promise;
  try {
    const pages: PdfTextItem[][] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .filter(
            (item): item is Extract<typeof item, { str: string }> =>
              "str" in item,
          )
          .map((item) => ({
            x: item.transform[4],
            y: item.transform[5],
            text: item.str,
          })),
      );
      page.cleanup();
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

export async function readPdfPages(
  bytes: ArrayBuffer,
): Promise<PdfTextItem[][]> {
  if (bytes.byteLength === 0) throw new Error("Arquivo PDF vazio");
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error("Arquivo PDF excede o limite de 5 MiB");
  }

  try {
    return await extractPdfPages(bytes);
  } catch {
    throw new Error(
      "Não foi possível ler o PDF. Ele pode estar protegido por senha ou corrompido.",
    );
  }
}

export async function readPdfVisualLines(
  bytes: ArrayBuffer,
): Promise<PdfVisualLine[]> {
  const lines = groupPdfVisualLines(await readPdfPages(bytes));
  if (lines.length > MAX_PDF_LINES) {
    throw new Error("Arquivo PDF excede o limite de 10.000 linhas");
  }
  return lines;
}
