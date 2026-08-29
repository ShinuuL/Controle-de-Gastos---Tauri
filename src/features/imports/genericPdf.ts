import type { PdfVisualLine } from "./pdfText";
import {
  classifyNatureByDescription,
  isBalanceDescription,
  parseLooseStatementDate,
  type ParsedNature,
  type ParsedStatement,
  type ParsedStatementRow,
  type StatementIssue,
} from "./statementValues";

/**
 * Valor monetário no padrão brasileiro, com os dois decimais obrigatórios. O
 * sinal pode vir antes ou depois, e o `R$` é opcional.
 *
 * Os dois decimais não são preciosismo: são o que separa um valor de um número
 * de agência, de CNPJ ou de parcela dentro da descrição.
 */
const MONEY = /(?:R\$\s*)?([+-]?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*([+-]?)/g;

/** Data no começo da linha, nos formatos que os extratos usam. */
const LEADING_DATE =
  /^(\d{2}[/.-]\d{2}[/.-]\d{2,4}|\d{1,2}\s+(?:de\s+)?[A-Za-zÀ-ÿ]{3,}\.?(?:\s+(?:de\s+)?\d{4})?)\b/;

/** Linha que contém só uma data: cabeçalho de bloco de dia. */
const DATE_ONLY = /^\d{2}[/.-]\d{2}[/.-]\d{2,4}$|^\d{1,2}\s+(?:de\s+)?[A-Za-zÀ-ÿ]{3,}\.?(?:\s+(?:de\s+)?\d{4})?$/;

interface MoneyMatch {
  start: number;
  end: number;
  amount_cents: number;
  sign: "" | "+" | "-";
}

function findMoney(text: string): MoneyMatch[] {
  const matches: MoneyMatch[] = [];
  MONEY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MONEY.exec(text)) !== null) {
    const [full, leading, whole, decimals, trailing] = match;
    if (leading && trailing) continue;
    const cents = Number(`${whole.replace(/\./g, "")}${decimals}`);
    if (!Number.isSafeInteger(cents) || cents <= 0) continue;
    const sign = (leading || trailing) as "" | "+" | "-";
    matches.push({
      start: match.index,
      end: match.index + full.trimEnd().length,
      amount_cents: cents,
      sign,
    });
  }
  return matches;
}

/** Ano do documento, para os extratos que só repetem "01 AGO" em cada bloco. */
export function findDocumentYear(lines: PdfVisualLine[]): number | undefined {
  for (const line of lines) {
    const match = /\b(20\d{2})\b/.exec(line.text);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function natureOf(
  sign: "" | "+" | "-",
  description: string,
  marker: string,
  unsignedIsEntrada: boolean,
): ParsedNature {
  if (sign === "-") return "saida";
  if (sign === "+") return "entrada";
  // Coluna C/D usada por vários bancos logo depois do valor.
  if (/\bD\b\s*$/.test(marker)) return "saida";
  if (/\bC\b\s*$/.test(marker)) return "entrada";
  // Extrato que marca os débitos com "-" está dizendo, por omissão, que valor
  // sem sinal é crédito. Ler isso do próprio documento corrige o erro que a
  // heurística de texto cometia sozinha: no PDF do Itaú, "PIX TRANSF FULANO"
  // não tem palavra que revele o sentido e virava saída mesmo sendo entrada.
  if (unsignedIsEntrada) return "entrada";
  return classifyNatureByDescription(description) ?? "saida";
}

function cleanDescription(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|]+/, "")
    .replace(/[\s\-–—:|]+$/, "")
    .trim();
}

/**
 * Parser de extrato em PDF independente de banco.
 *
 * Cobre os dois desenhos que aparecem na prática:
 *
 * - **Tabular** (Itaú, Bradesco, BB, Caixa): cada lançamento é uma linha
 *   `data | descrição | valor [| saldo]`. Quando há dois valores na linha, o
 *   primeiro é o lançamento e o segundo é o saldo acumulado.
 * - **Por bloco de dia** (Nubank, Inter, C6): a data aparece sozinha como
 *   cabeçalho e os lançamentos seguintes herdam essa data.
 *
 * O modo por bloco só é habilitado quando o documento realmente tem linhas
 * contendo apenas uma data. Sem essa trava, uma linha de continuação de
 * descrição com número dentro viraria lançamento fantasma em extrato tabular.
 *
 * Quando nem o sinal nem uma coluna C/D dizem a natureza, ela sai da descrição
 * ("Transferência enviada" vs. "recebida"); se nem isso decidir, assume saída e
 * a prévia deixa o usuário corrigir antes de gravar.
 */
export function parseGenericPdfLines(lines: PdfVisualLine[]): ParsedStatement {
  const rows: ParsedStatementRow[] = [];
  const issues: StatementIssue[] = [];
  const fallbackYear = findDocumentYear(lines);
  // Detectado uma vez no documento inteiro: uma linha só não diz se o extrato
  // usa sinal explícito, e a resposta muda a natureza de todas as outras.
  const unsignedIsEntrada = lines.some((line) =>
    findMoney(line.text).some((money) => money.sign === "-"),
  );
  const hasDateBlocks = lines.some(
    (line) =>
      DATE_ONLY.test(line.text.trim()) &&
      parseLooseStatementDate(line.text.trim(), fallbackYear) !== null,
  );
  let blockDate: string | null = null;

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;

    if (DATE_ONLY.test(text)) {
      const parsed = parseLooseStatementDate(text, fallbackYear);
      if (parsed) {
        blockDate = parsed;
        continue;
      }
    }

    const money = findMoney(text);
    if (money.length === 0) continue;

    const leadingDate = LEADING_DATE.exec(text);
    const rowDate = leadingDate
      ? parseLooseStatementDate(leadingDate[1], fallbackYear)
      : hasDateBlocks
        ? blockDate
        : null;
    if (!rowDate) continue;

    // Com dois valores na linha, o segundo é o saldo acumulado do dia.
    const value = money[0];
    const descriptionStart = leadingDate ? leadingDate[0].length : 0;
    const description = cleanDescription(
      text.slice(descriptionStart, value.start),
    );
    const marker = text.slice(value.end, value.end + 3);

    if (isBalanceDescription(description)) continue;
    if (!description) {
      issues.push({ sourceRow: line.sourceRow, message: "Descrição inválida" });
      continue;
    }

    rows.push({
      sourceRow: line.sourceRow,
      date: rowDate,
      description,
      amount_cents: value.amount_cents,
      nature: natureOf(value.sign, description, marker, unsignedIsEntrada),
    });
  }

  return { rows, issues };
}
