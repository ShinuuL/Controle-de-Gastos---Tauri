export type ParsedNature = "entrada" | "saida";

export interface ParsedStatementRow {
  sourceRow: number;
  date: string;
  description: string;
  amount_cents: number;
  nature: ParsedNature;
  suggestedCategoryName?: string;
  /**
   * Identificador estavel do lancamento no banco de origem, quando o extrato
   * traz um (o CSV do Nubank tem a coluna `Identificador`). Vira o fingerprint
   * da importacao: sobrevive a edicoes de natureza na previa e reconhece a
   * mesma linha em uma reimportacao do periodo, coisa que a chave derivada de
   * data+valor+descricao nao faz.
   */
  externalId?: string;
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
 * Valor no padrao do Nubank: ponto decimal e nenhum separador de milhar
 * (14.00, -13.12, 1302.48).
 *
 * Fica separado de `parseSignedAmount` de proposito. Um parser unico que
 * aceitasse os dois padroes leria "1.234" como 1234,00 num banco e 1,23 no
 * outro -- erro de fator 1000 em silencio. Quem escolhe e o parser do banco,
 * que ja sabe qual formato o arquivo usa.
 */
export function parseSignedDotAmount(value: string): SignedAmount | null {
  const normalized = value.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  const match = /^([+-]?)(\d+(?:\.\d{1,2})?)$/.exec(normalized);
  if (!match) return null;
  const [, sign, digits] = match;
  const [whole, decimal = ""] = digits.split(".");
  const cents = Number(`${whole}${decimal.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return { amount_cents: cents, nature: sign === "-" ? "saida" : "entrada" };
}

/**
 * Linhas de saldo ("SALDO DO DIA", "SALDO ANTERIOR", "SALDO TOTAL DISPONÍVEL")
 * não são lançamentos: elas repetem o acumulado do dia na coluna de saldo. Não
 * viram issue porque não há nada que o usuário possa corrigir nelas.
 */
export function isBalanceDescription(description: string): boolean {
  return /^saldo\b/i.test(normalizeAccents(description).trim());
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Data em qualquer dos formatos que os PDFs de extrato usam: `01/08/2026`,
 * `01/08/26`, `2026-08-01`, `01 AGO 2026` e `01 de agosto de 2026`.
 *
 * Existe separada de `parseStatementDate` (estrita, `dd/MM/yyyy`) porque só o
 * caminho de PDF genérico precisa dessa tolerância: no CSV o formato é fixo por
 * banco e aceitar variações lá só criaria ambiguidade.
 *
 * `fallbackYear` cobre os extratos que escrevem o ano uma vez no cabeçalho e
 * repetem só `01 AGO` em cada bloco de dia.
 */
export function parseLooseStatementDate(
  value: string,
  fallbackYear?: number,
): string | null {
  const text = normalizeAccents(value).trim().toLowerCase();

  const numeric = /^(\d{2})[/.-](\d{2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (numeric) {
    const year = Number(numeric[3]);
    return isoDate(
      numeric[3].length === 2 ? 2000 + year : year,
      Number(numeric[2]),
      Number(numeric[1]),
    );
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const named = /^(\d{1,2})\s*(?:de\s+)?([a-z]{3,})\.?(?:\s+(?:de\s+)?(\d{4}))?$/.exec(text);
  if (named) {
    const month = MONTH_NAMES[named[2].slice(0, 3)];
    if (!month) return null;
    const year = named[3] ? Number(named[3]) : fallbackYear;
    if (!year) return null;
    return isoDate(year, month, Number(named[1]));
  }

  return null;
}

const ENTRADA_PATTERNS = [
  /\brecebid[ao]\b/, /\bcredito\b/, /\bdeposito\b/, /\bestorno\b/,
  /\bsalario\b/, /\brendimento\b/, /\bresgate\b/, /\brembolso\b/,
  /\breembolso\b/, /\bdevolucao\b/, /\bentrada\b/, /\bprovento\b/,
];
const SAIDA_PATTERNS = [
  /\benviad[ao]\b/, /\bdebito\b/, /\bpagamento\b/, /\bcompra\b/,
  /\bsaque\b/, /\btarifa\b/, /\bboleto\b/, /\bfatura\b/, /\btransferencia enviada\b/,
  /\bcobranca\b/, /\bassinatura\b/, /\bsaida\b/, /\bimposto\b/, /\btaxa\b/,
];

/**
 * Natureza deduzida do texto do lançamento, para os extratos que não escrevem
 * sinal nem coluna de débito/crédito -- caso do PDF do Nubank, que diferencia
 * "Transferência enviada" de "Transferência recebida" só na descrição.
 *
 * Retorna `null` quando o texto não decide: aí quem chama mantém o padrão e a
 * prévia deixa o usuário corrigir, em vez de gravar um palpite errado.
 */
export function classifyNatureByDescription(
  description: string,
): ParsedNature | null {
  const text = normalizeAccents(description).toLowerCase();
  const entrada = ENTRADA_PATTERNS.some((pattern) => pattern.test(text));
  const saida = SAIDA_PATTERNS.some((pattern) => pattern.test(text));
  if (entrada === saida) return null;
  return entrada ? "entrada" : "saida";
}
