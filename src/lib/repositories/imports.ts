import { invoke } from "@tauri-apps/api/core";
import {
  RECONCILIATION_DAY_WINDOW,
  type ReconciliationCandidate,
} from "../../features/imports/reconciliation";
import { getDb } from "../db";
import { traceOperation } from "../observability/telemetry";
import type { ApprovedImportLine, ImportResult } from "../types";
import {
  validateAmount,
  validateDate,
  validateNature,
} from "./validation";

type CandidateLookupRow = Pick<
  ReconciliationCandidate,
  "date" | "amount_cents" | "nature"
>;

/**
 * Busca as movimentacoes ja gravadas que podem ser a mesma linha do extrato.
 *
 * E uma consulta so para o extrato inteiro: a janela vai da data mais antiga
 * menos `RECONCILIATION_DAY_WINDOW` ate a mais recente mais a mesma folga, e o
 * casamento por valor e natureza e feito aqui, sobre o resultado. Antes era uma
 * consulta por linha -- 70 idas e voltas de IPC para um extrato mensal do
 * Nubank, e bastava uma falhar para a previa inteira morrer com "nao foi
 * possivel comparar o extrato com as movimentacoes".
 *
 * A descricao continua fora do filtro de proposito: e justamente quando ela
 * difere -- lancamento digitado a mao contra texto do banco -- que a duplicata
 * passava batido.
 *
 * O resultado e deduplicado por `id` porque a mesma movimentacao existente cai
 * na janela de varias linhas do extrato.
 */
export async function findReconciliationCandidates(
  rows: CandidateLookupRow[],
): Promise<ReconciliationCandidate[]> {
  return traceOperation("statementImport.findCandidates", async () => {
    const wanted = rows.map((row) => ({
      date: validateDate(row.date),
      amount_cents: validateAmount(row.amount_cents),
      nature: validateNature(row.nature),
    }));
    if (wanted.length === 0) return [];

    const dates = wanted.map((row) => row.date).sort();
    const db = await getDb();
    const found = await db.select<ReconciliationCandidate[]>(
      `SELECT e.id, e.date, e.description, e.amount_cents, e.nature, e.import_fingerprint
         FROM expenses e
         WHERE e.date >= date($1, $2) AND e.date <= date($3, $4)`,
      [
        dates[0],
        `-${RECONCILIATION_DAY_WINDOW} days`,
        dates[dates.length - 1],
        `+${RECONCILIATION_DAY_WINDOW} days`,
      ],
    );

    const keys = new Set(
      wanted.map((row) => `${row.amount_cents}|${row.nature}`),
    );
    const byId = new Map<string, ReconciliationCandidate>();
    for (const candidate of found) {
      if (keys.has(`${candidate.amount_cents}|${candidate.nature}`)) {
        byId.set(candidate.id, candidate);
      }
    }
    return [...byId.values()];
  });
}

export async function confirmStatementImport(
  lines: ApprovedImportLine[],
): Promise<ImportResult> {
  return traceOperation("statementImport.confirm", async () => {
    return invoke<ImportResult>("confirm_statement_import", { lines });
  });
}
