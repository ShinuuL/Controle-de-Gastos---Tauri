export type ParsedNature = "entrada" | "saida";

export interface ParsedStatementRow {
  sourceRow: number;
  date: string;
  description: string;
  amount_cents: number;
  nature: ParsedNature;
  suggestedCategoryName?: string;
}

export interface StatementIssue {
  sourceRow: number;
  message: string;
}

export interface ParsedStatement {
  rows: ParsedStatementRow[];
  issues: StatementIssue[];
}

export interface SignedAmount {
  amount_cents: number;
  nature: ParsedNature;
}

export function normalizeAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function parseStatementDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/**
 * Aceita os dois jeitos que o Itaú escreve valor: sem sinal (o extrato web traz
 * uma coluna "Tipo" com C/D ao lado) e com sinal embutido, que é o que o app
 * gera tanto no CSV quanto no PDF. O sinal pode vir antes ou depois do número.
 */
export function parseSignedAmount(value: string): SignedAmount | null {
  const normalized = value.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  const match = /^([+-]?)(\d+(?:\.\d{3})*(?:,\d{1,2})?)([+-]?)$/.exec(normalized);
  if (!match) return null;
  const [, leading, digits, trailing] = match;
  if (leading && trailing) return null;
  const [whole, decimal = ""] = digits.replace(/\./g, "").split(",");
  const cents = Number(`${whole}${decimal.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return { amount_cents: cents, nature: `${leading}${trailing}` === "-" ? "saida" : "entrada" };
}

/**
 * Linhas de saldo ("SALDO DO DIA", "SALDO ANTERIOR", "SALDO TOTAL DISPONÍVEL")
 * não são lançamentos: elas repetem o acumulado do dia na coluna de saldo. Não
 * viram issue porque não há nada que o usuário possa corrigir nelas.
 */
export function isBalanceDescription(description: string): boolean {
  return /^saldo\b/i.test(normalizeAccents(description).trim());
}
