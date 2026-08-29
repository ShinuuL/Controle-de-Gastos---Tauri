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
 * Busca as movimentações já gravadas que podem ser a mesma linha do extrato.
 *
 * A janela de dias vem de `RECONCILIATION_DAY_WINDOW` e é aplicada no SQL para
 * não trazer o mês inteiro para a memória. A descrição não entra no filtro de
 * propósito: é justamente quando ela difere -- lançamento digitado à mão contra
 * texto do banco -- que a duplicata passava batido.
 *
 * O resultado é deduplicado por `id` porque a mesma movimentação existente cai
 * na janela de várias linhas do extrato.
 */
export async function findReconciliationCandidates(
  rows: CandidateLookupRow[],
): Promise<ReconciliationCandidate[]> {
  return traceOperation("statementImport.findCandidates", async () => {
    const byId = new Map<string, ReconciliationCandidate>();
    const db = await getDb();
    for (const row of rows) {
      const date = validateDate(row.date);
      const amountCents = validateAmount(row.amount_cents);
      const nature = validateNature(row.nature);
      const found = await db.select<ReconciliationCandidate[]>(
        `SELECT e.id, e.date, e.description, e.amount_cents, e.nature, e.import_fingerprint
         FROM expenses e
         WHERE e.amount_cents = $1 AND e.nature = $2
           AND e.date >= date($3, $4) AND e.date <= date($3, $5)`,
        [
          amountCents,
          nature,
          date,
          `-${RECONCILIATION_DAY_WINDOW} days`,
          `+${RECONCILIATION_DAY_WINDOW} days`,
        ],
      );
      for (const candidate of found) byId.set(candidate.id, candidate);
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
