import { invoke } from "@tauri-apps/api/core";
import type { ReconciliationCandidate } from "../../features/imports/reconciliation";
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

export async function findReconciliationCandidates(
  rows: CandidateLookupRow[],
): Promise<ReconciliationCandidate[]> {
  return traceOperation("statementImport.findCandidates", async () => {
    const candidates: ReconciliationCandidate[] = [];
    const db = await getDb();
    for (const row of rows) {
      const date = validateDate(row.date);
      const amountCents = validateAmount(row.amount_cents);
      const nature = validateNature(row.nature);
      const found = await db.select<ReconciliationCandidate[]>(
        `SELECT e.id, e.date, e.description, e.amount_cents, e.nature
         FROM expenses e
         WHERE e.date = $1 AND e.amount_cents = $2 AND e.nature = $3`,
        [date, amountCents, nature],
      );
      candidates.push(...found);
    }
    return candidates;
  });
}

export async function confirmStatementImport(
  lines: ApprovedImportLine[],
): Promise<ImportResult> {
  return traceOperation("statementImport.confirm", async () => {
    return invoke<ImportResult>("confirm_statement_import", { lines });
  });
}
