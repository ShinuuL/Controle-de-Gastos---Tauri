import type { ParsedNature, ParsedStatementRow } from "./itauCsv";

export interface ReconciliationCandidate {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  nature: ParsedNature;
  /** Fingerprint gravado quando a movimentação veio de uma importação anterior. */
  import_fingerprint?: string | null;
}

/**
 * Tolerância, em dias, entre a data do extrato e a data do lançamento digitado
 * à mão.
 *
 * Quem digita usa a data da compra; o banco registra a data da liquidação, que
 * costuma cair um ou dois dias depois. Sem janela, o app não desconfiava de
 * nada e o mesmo gasto entrava duas vezes -- uma digitada, outra importada.
 */
export const RECONCILIATION_DAY_WINDOW = 3;

/** Conflito carrega a movimentação existente para a prévia mostrar lado a lado. */
export interface ReconciliationConflict extends ParsedStatementRow {
  existing: ReconciliationCandidate;
}

export interface ReconciliationResult {
  newRows: ParsedStatementRow[];
  duplicates: ParsedStatementRow[];
  conflicts: ReconciliationConflict[];
}

export function normalizeDescription(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function reconciliationKey(row: Pick<ParsedStatementRow, "date" | "nature" | "amount_cents" | "description">): string {
  return `${row.date}|${row.nature}|${row.amount_cents}|${normalizeDescription(row.description)}`;
}

/** Distância em dias entre duas datas ISO. */
export function dayDistance(left: string, right: string): number {
  const day = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / day);
}

function sameValueAndNature(left: ParsedStatementRow, right: ReconciliationCandidate): boolean {
  return left.nature === right.nature && left.amount_cents === right.amount_cents;
}

/**
 * Movimentação já gravada que provavelmente é a mesma linha do extrato.
 *
 * A regra é valor e natureza iguais dentro da janela de dias, sem exigir
 * nenhuma semelhança de texto. Exigir texto parecido -- como a versão anterior
 * fazia -- inutilizava a checagem justamente no caso que mais importa: quem
 * digita escreve "Uber", e o extrato traz "Transferência enviada pelo Pix - 99
 * TECNOLOGIA LTDA - 18.033.552/0001-61 - BANCO BTG PACTUAL". Zero palavras em
 * comum, mesmo gasto.
 */
function findPossibleMatch(
  row: ParsedStatementRow,
  existing: ReconciliationCandidate[],
): ReconciliationCandidate | undefined {
  return existing
    .filter((candidate) => sameValueAndNature(row, candidate))
    .filter((candidate) => dayDistance(row.date, candidate.date) <= RECONCILIATION_DAY_WINDOW)
    .sort((left, right) => dayDistance(row.date, left.date) - dayDistance(row.date, right.date))[0];
}

/**
 * Separa as linhas do extrato em novas, duplicadas e conflitos.
 *
 * Duplicata é certeza -- mesmo identificador do banco, ou linha idêntica em
 * data, valor, natureza e descrição -- e é descartada sem perguntar. Conflito é
 * suspeita e sempre vai para decisão manual.
 *
 * A comparação de conflito é só contra o que já está gravado. Duas linhas
 * parecidas dentro do mesmo extrato não são suspeitas: o banco não emite o
 * mesmo lançamento duas vezes por engano, e no Nubank cada uma tem
 * identificador próprio.
 */
export function reconcileStatement(
  rows: ParsedStatementRow[],
  existing: ReconciliationCandidate[],
): ReconciliationResult {
  const newRows: ParsedStatementRow[] = [];
  const duplicates: ParsedStatementRow[] = [];
  const conflicts: ReconciliationConflict[] = [];
  const knownKeys = new Set(existing.map(reconciliationKey));
  const knownFingerprints = new Set(
    existing.map((candidate) => candidate.import_fingerprint).filter((value): value is string => Boolean(value)),
  );

  for (const row of rows) {
    if (row.externalId && knownFingerprints.has(row.externalId)) {
      duplicates.push(row);
      continue;
    }

    const key = reconciliationKey(row);
    // Sem identificador do banco, duas linhas idênticas do mesmo arquivo são
    // indistinguíveis: a segunda é tratada como repetição.
    if (!row.externalId && knownKeys.has(key)) {
      duplicates.push(row);
      continue;
    }
    knownKeys.add(key);
    if (row.externalId) knownFingerprints.add(row.externalId);

    const match = findPossibleMatch(row, existing);
    if (match) {
      conflicts.push({ ...row, existing: match });
      continue;
    }

    newRows.push(row);
  }

  return { newRows, duplicates, conflicts };
}
