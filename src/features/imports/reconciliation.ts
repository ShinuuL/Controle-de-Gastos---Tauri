import type { ParsedNature, ParsedStatementRow } from "./itauCsv";

export interface ReconciliationCandidate {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  nature: ParsedNature;
}

export interface ReconciliationResult {
  newRows: ParsedStatementRow[];
  duplicates: ParsedStatementRow[];
  conflicts: ParsedStatementRow[];
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

function sameTransactionValues(left: ParsedStatementRow, right: ReconciliationCandidate | ParsedStatementRow): boolean {
  return left.date === right.date && left.nature === right.nature && left.amount_cents === right.amount_cents;
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeDescription(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeDescription(right).split(" ").filter(Boolean));
  const combined = new Set([...leftTokens, ...rightTokens]);
  if (combined.size === 0) return 1;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / combined.size;
}

function isPossibleConflict(row: ParsedStatementRow, candidate: ReconciliationCandidate | ParsedStatementRow): boolean {
  return sameTransactionValues(row, candidate)
    && normalizeDescription(row.description) !== normalizeDescription(candidate.description)
    && tokenSimilarity(row.description, candidate.description) >= 0.75;
}

export function reconcileStatement(rows: ParsedStatementRow[], existing: ReconciliationCandidate[]): ReconciliationResult {
  const newRows: ParsedStatementRow[] = [];
  const duplicates: ParsedStatementRow[] = [];
  const conflicts: ParsedStatementRow[] = [];
  const candidates: Array<ReconciliationCandidate | ParsedStatementRow> = [...existing];
  const knownKeys = new Set(existing.map(reconciliationKey));

  for (const row of rows) {
    const key = reconciliationKey(row);
    if (knownKeys.has(key)) {
      duplicates.push(row);
      continue;
    }

    knownKeys.add(key);

    if (candidates.some((candidate) => isPossibleConflict(row, candidate))) {
      conflicts.push(row);
      continue;
    }

    newRows.push(row);
    candidates.push(row);
  }

  return { newRows, duplicates, conflicts };
}
