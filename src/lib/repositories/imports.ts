import type Database from "@tauri-apps/plugin-sql";
import type { ReconciliationCandidate } from "../../features/imports/reconciliation";
import { getDb } from "../db";
import { traceOperation } from "../observability/telemetry";
import type {
  ApprovedImportLine,
  ImportResult,
  MovementNature,
} from "../types";
import {
  validateAmount,
  validateDate,
  validateDescription,
  validateNature,
} from "./validation";

type CandidateLookupRow = Pick<
  ReconciliationCandidate,
  "date" | "amount_cents" | "nature"
>;

interface ValidatedImportLine {
  categoryId: string;
  description: string;
  amountCents: number;
  date: string;
  nature: MovementNature;
  fingerprint: string;
  createCategoryName?: string;
}

class StatementImportError extends Error {}

function invalidCategory(): never {
  throw new StatementImportError("Informe uma categoria válida.");
}

function validateCategoryId(value: unknown): string {
  if (typeof value !== "string") return invalidCategory();
  const categoryId = value.trim();
  if (!categoryId) return invalidCategory();
  return categoryId;
}

function validateFingerprint(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new StatementImportError("Informe um identificador de importação válido.");
  }
  return value.trim();
}

function validateCreateCategoryName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) return invalidCategory();
  return value.trim();
}

function validateImportLines(lines: ApprovedImportLine[]): ValidatedImportLine[] {
  if (!Array.isArray(lines)) {
    throw new StatementImportError("Informe linhas válidas para importação.");
  }
  const fingerprints = new Set<string>();
  return lines.map((line) => {
    if (!line || typeof line !== "object") {
      throw new StatementImportError("Informe linhas válidas para importação.");
    }
    const fingerprint = validateFingerprint(line.fingerprint);
    if (fingerprints.has(fingerprint)) {
      throw new StatementImportError("Esta linha do extrato já foi importada.");
    }
    fingerprints.add(fingerprint);
    return {
      categoryId: validateCategoryId(line.category_id),
      description: validateDescription(line.description),
      amountCents: validateAmount(line.amount_cents),
      date: validateDate(line.date),
      nature: validateNature(line.nature),
      fingerprint,
      createCategoryName: validateCreateCategoryName(line.createCategoryName),
    };
  });
}

async function categoryIdFor(
  db: Database,
  line: ValidatedImportLine,
): Promise<string> {
  const categoryRows = await db.select<{ id: string }[]>(
    "SELECT id FROM categories WHERE id = $1",
    [line.categoryId],
  );
  if (categoryRows[0]) return categoryRows[0].id;
  if (!line.createCategoryName) {
    throw new StatementImportError("Categoria não encontrada.");
  }

  const namedCategoryRows = await db.select<{ id: string; name: string }[]>(
    "SELECT id, name FROM categories WHERE name = $1",
    [line.createCategoryName],
  );
  if (namedCategoryRows[0]) return namedCategoryRows[0].id;

  const sortRows = await db.select<{ max: number | null }[]>(
    "SELECT MAX(sort_order) AS max FROM categories",
  );
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO categories (id, name, icon, color, is_preset, budget_monthly, sort_order, created_at)
     VALUES ($1, $2, $3, $4, 0, $5, $6, $7)`,
    [
      id,
      line.createCategoryName,
      "tag",
      "#6366F1",
      null,
      (sortRows[0]?.max ?? -1) + 1,
      now,
    ],
  );
  return id;
}

function safeImportError(error: unknown): Error {
  if (error instanceof StatementImportError) return error;
  return new StatementImportError("Não foi possível confirmar a importação do extrato.");
}

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
    const validatedLines = validateImportLines(lines);
    if (validatedLines.length === 0) return { imported: 0 };

    const db = await getDb();
    let transactionStarted = false;
    try {
      await db.execute("BEGIN IMMEDIATE");
      transactionStarted = true;
      for (const line of validatedLines) {
        const duplicateRows = await db.select<{ id: string }[]>(
          "SELECT id FROM expenses WHERE import_fingerprint = $1",
          [line.fingerprint],
        );
        if (duplicateRows[0]) {
          throw new StatementImportError("Esta linha do extrato já foi importada.");
        }
        const categoryId = await categoryIdFor(db, line);
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await db.execute(
          `INSERT INTO expenses (id, category_id, description, amount_cents, date, nature, status, created_at, updated_at, import_fingerprint)
           VALUES ($1, $2, $3, $4, $5, $6, 'realizado', $7, $7, $8)`,
          [
            id,
            categoryId,
            line.description,
            line.amountCents,
            line.date,
            line.nature,
            now,
            line.fingerprint,
          ],
        );
      }
      await db.execute("COMMIT");
      transactionStarted = false;
      return { imported: validatedLines.length };
    } catch (error) {
      if (transactionStarted) {
        try {
          await db.execute("ROLLBACK");
        } catch {
          /* The original safe error is more useful than a rollback failure. */
        }
      }
      throw safeImportError(error);
    }
  });
}
