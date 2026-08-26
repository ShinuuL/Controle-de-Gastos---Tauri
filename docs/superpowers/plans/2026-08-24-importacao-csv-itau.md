# Importação CSV Itaú Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar extratos CSV de conta-corrente Itaú com prévia revisável, deduplicação e conciliação local.

**Architecture:** Um parser puro converte o arquivo em linhas normalizadas sem tocar no banco. Um serviço de conciliação classifica as linhas usando uma chave exata e similaridade conservadora. A confirmação das linhas aprovadas é um comando Rust/Tauri tipado e atômico; a tela de Movimentações somente orquestra seleção, prévia e invocação.

**Tech Stack:** React 19, TypeScript strict, Vitest 4, Tauri 2, SQLite via `@tauri-apps/plugin-sql`, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-08-24-importacao-csv-itau-design.md`

## Global Constraints

- Processar o CSV integralmente no dispositivo; não adicionar API, Open Finance, carteira digital, telemetria remota ou dependências.
- Aceitar apenas CSV de conta-corrente Itaú no primeiro recorte; cartão, OFX, PDF/XLS e outros bancos ficam fora do escopo.
- Usar datas ISO `YYYY-MM-DD`, valores BRL em centavos inteiros positivos e SQL com placeholders `$1`, `$2`, ... .
- Toda operação nova de repositório deve usar `traceOperation` e entrar em `METRIC_OPERATIONS`.
- Alterações de esquema devem ser uma nova migração Rust; atualizar o teste de contagem de migrações.
- Não incluir conteúdo de extrato em erros nem em telemetria.

---

## File structure

- Create `src/features/imports/itauCsv.ts`: decodificação, reconhecimento de cabeçalhos e parser puro do CSV Itaú.
- Create `src/features/imports/reconciliation.ts`: chave de comparação, detecção de duplicatas e candidatos a conflito.
- Create `src/features/imports/itauCsv.test.ts` and `src/features/imports/reconciliation.test.ts`: contratos dos módulos puros.
- Create `src/features/imports/ImportStatementModal.tsx`: prévia acessível e edição de categoria/natureza antes da confirmação.
- Create `src/lib/repositories/imports.ts` and `src/lib/repositories/imports.test.ts`: consulta de candidatos e confirmação atômica.
- Modify `src/lib/types.ts`, `src/lib/observability/telemetry.ts`, `src/features/transactions/TransactionsScreen.tsx`, `src-tauri/src/migrations.rs` and `ROADMAP.md`.

### Task 1: Parser CSV Itaú

**Files:**
- Create: `src/features/imports/itauCsv.ts`
- Test: `src/features/imports/itauCsv.test.ts`

**Interfaces:**
- Produces `parseItauCsv(bytes: ArrayBuffer): ParsedStatement`.
- `ParsedStatement` contains `rows: ParsedStatementRow[]` and `issues: CsvIssue[]`; a valid row has `sourceRow`, `date`, `description`, `amount_cents`, `nature` and optional `suggestedCategoryName`.

- [ ] **Step 1: Write the failing parser tests**

```ts
it("parses semicolon-delimited Itaú rows into ISO dates and cents", () => {
  const csv = "Data;Histórico;Valor;Tipo\n05/01/2026;PIX RECEBIDO;7.500,00;C";
  expect(parseItauCsv(utf8(csv).buffer).rows).toEqual([{
    sourceRow: 2, date: "2026-01-05", description: "PIX RECEBIDO",
    amount_cents: 750000, nature: "entrada", suggestedCategoryName: undefined,
  }]);
});
```

- [ ] **Step 2: Run the parser tests to verify they fail**

Run: `npm test -- src/features/imports/itauCsv.test.ts`

Expected: FAIL because `itauCsv.ts` does not exist.

- [ ] **Step 3: Implement the parser without a CSV dependency**

```ts
export function parseItauCsv(bytes: ArrayBuffer): ParsedStatement {
  const text = decodeCsv(bytes);
  const records = parseSemicolonRecords(text);
  const columns = mapItauHeaders(records[0] ?? []);
  return parseRows(records.slice(1), columns);
}
```

Implement quoted-field handling, UTF-8 then Windows-1252 decoding, BOM removal, a 5 MiB/10,000-row limit, header aliases (`Data`, `Histórico`/`Lançamento`, `Valor`, `Tipo`, optional `Categoria`), `DD/MM/YYYY` validation, BRL conversion and `C`/`D` mapping. Report every invalid row in `issues`; throw a safe pt-BR error for an empty file, invalid header, unsupported structure or exceeded limit.

- [ ] **Step 4: Extend and run parser tests**

Add cases for Windows-1252 accents, quoted `;`, `D` as `saida`, optional category, invalid date/value/type, empty file, missing required header, limit and preservation of a valid row beside an invalid one.

Run: `npm test -- src/features/imports/itauCsv.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the parser unit**

```bash
git add src/features/imports/itauCsv.ts src/features/imports/itauCsv.test.ts
git commit -m "feat: parsear extrato CSV Itau"
```

### Task 2: Classificação de duplicatas e conflitos

**Files:**
- Create: `src/features/imports/reconciliation.ts`
- Test: `src/features/imports/reconciliation.test.ts`

**Interfaces:**
- Consumes `ParsedStatementRow` from Task 1 and `ReconciliationCandidate` from the repository.
- Produces `reconcileStatement(rows, existing): ReconciliationResult`, com `newRows`, `duplicates` e `conflicts`.

- [ ] **Step 1: Write failing reconciliation tests**

```ts
it("marks the same normalized date, nature, amount and description as duplicate", () => {
  const row = parsed({ description: "  IFOOD\u00a0* Pedido " });
  expect(reconcileStatement([row], [candidate({ description: "ifood * pedido" })]).duplicates)
    .toEqual([{ row, existingId: "tx-1" }]);
});
```

- [ ] **Step 2: Run the reconciliation tests to verify they fail**

Run: `npm test -- src/features/imports/reconciliation.test.ts`

Expected: FAIL because `reconciliation.ts` does not exist.

- [ ] **Step 3: Implement deterministic keys and conservative conflict detection**

```ts
export function reconciliationKey(row: ReconciliationFields): string {
  return [row.date, row.nature, row.amount_cents, normalizeDescription(row.description)].join("|");
}

export function isPossibleConflict(a: ReconciliationFields, b: ReconciliationFields): boolean {
  return a.date === b.date && a.nature === b.nature && a.amount_cents === b.amount_cents
    && normalizeDescription(a.description) !== normalizeDescription(b.description)
    && descriptionSimilarity(a.description, b.description) >= 0.75;
}
```

Normalize Unicode, accents, case and whitespace only. Use token overlap (not a model or fuzzy automatic merge) for similarity. Deduplicate repeated lines within the uploaded file before comparison with existing rows. A conflict remains pending user choice; it must not enter `newRows` automatically.

- [ ] **Step 4: Run the expanded reconciliation tests**

Add cases for internal duplicates, different amounts/dates, accented/whitespace variants, near descriptions becoming conflicts, unrelated same-value records staying new, and no automatic merge.

Run: `npm test -- src/features/imports/reconciliation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the reconciliation unit**

```bash
git add src/features/imports/reconciliation.ts src/features/imports/reconciliation.test.ts
git commit -m "feat: conciliar linhas de extrato"
```

### Task 3: Persistência atômica e migração

**Files:**
- Modify: `src-tauri/src/migrations.rs`
- Modify: `src/lib/types.ts`
- Create: `src/lib/repositories/imports.ts`
- Test: `src/lib/repositories/imports.test.ts`
- Modify: `src/lib/observability/telemetry.ts`
- Modify: `src-tauri/src/migrations.rs` tests

**Interfaces:**
- Produces `findReconciliationCandidates(rows): Promise<ReconciliationCandidate[]>`.
- Produces `confirmStatementImport(lines: ApprovedImportLine[]): Promise<ImportResult>`.
- `ApprovedImportLine` has a validated transaction payload, `fingerprint` and optional `createCategoryName`.

- [ ] **Step 1: Write failing repository and migration tests**

```ts
it("rolls back every approved line when one insert fails", async () => {
  const db = createTransactionalFakeDb({ failOnInsert: 2 });
  await expect(confirmStatementImport([approved("a"), approved("b")])).rejects.toThrow();
  expect(db.persistedExpenses).toEqual([]);
});
```

Add Rust assertions for migration 4, the new `import_fingerprint` column and partial unique index. Update the migration count assertion from 3 to 4.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- src/lib/repositories/imports.test.ts; cd src-tauri; cargo test migrations_enforce_positive_expense_amounts_without_rebuilding_expenses`

Expected: FAIL because the repository and migration do not exist.

- [ ] **Step 3: Add migration 4 and repository implementation**

```sql
ALTER TABLE expenses ADD COLUMN import_fingerprint TEXT;
CREATE UNIQUE INDEX idx_expenses_import_fingerprint
  ON expenses(import_fingerprint) WHERE import_fingerprint IS NOT NULL;
```

Inside `confirmStatementImport`, issue `BEGIN IMMEDIATE`, validate each line, resolve category IDs, create only the explicitly supplied missing categories with safe defaults (`tag`, `#6366F1`, no budget), insert each `expenses` row with `status = 'realizado'` and its fingerprint, then `COMMIT`; on any error issue `ROLLBACK` and rethrow a safe pt-BR error. Query candidates with parameterized date/amount/nature predicates and compare descriptions in Task 2. Wrap both exported repository operations in `traceOperation` and add `statementImport.findCandidates` and `statementImport.confirm` to `METRIC_OPERATIONS`.

- [ ] **Step 4: Run focused tests to verify pass**

Run: `npm test -- src/lib/repositories/imports.test.ts; cd src-tauri; cargo test migrations_enforce_positive_expense_amounts_without_rebuilding_expenses`

Expected: PASS.

- [ ] **Step 5: Commit the persistence unit**

```bash
git add src-tauri/src/migrations.rs src/lib/types.ts src/lib/repositories/imports.ts src/lib/repositories/imports.test.ts src/lib/observability/telemetry.ts
git commit -m "feat: persistir importacao de extrato"
```

### Task 4: Prévia e confirmação na tela de Movimentações

**Files:**
- Create: `src/features/imports/ImportStatementModal.tsx`
- Modify: `src/features/transactions/TransactionsScreen.tsx`

**Interfaces:**
- Consumes parser, reconciliation result, `Category[]`, `findReconciliationCandidates` and `confirmStatementImport`.
- Produces one callback `onImported(): Promise<void>` that recarrega mês e categorias.

- [ ] **Step 1: Define the UI states with an initially failing typecheck**

Add to `TransactionsScreen` an `importState` discriminated union for idle, parsing, preview, confirming and error; render a button with an accessible label and hidden file input accepting `.csv,text/csv`.

Run: `npm run typecheck`

Expected: FAIL until `ImportStatementModal` is exported and its props are implemented.

- [ ] **Step 2: Implement the accessible preview modal**

```tsx
<ImportStatementModal
  open={importState.kind === "preview"}
  categories={categories}
  result={importState.result}
  onConfirm={confirmImport}
  onClose={closeImport}
/>
```

Show counts for new, duplicate, conflict and invalid rows. Render duplicates read-only; render conflicts with explicit “importar” or “ignorar”; render each importable row with controls for category and nature. Do not preselect a category when no CSV category maps to an existing category. Disable confirmation until every selected line has a category. On success close the modal, reload transactions for the currently selected month and reload categories; retain the modal and show its safe error when confirmation fails.

- [ ] **Step 3: Run static and visual validation**

Run: `npm run typecheck; npm run lint; npm run build`

Expected: PASS.

Then run `netstat -ano | findstr :1420`, stop any orphaned Vite process, start `npm --prefix "D:\Dev\Desenvolvimento\Projetos\Controle de gastos" run dev`, and visually verify file selection, each preview group, keyboard modal closing, required-category blocking and post-import refresh. Stop the server after the check.

- [ ] **Step 4: Commit the UI unit**

```bash
git add src/features/imports/ImportStatementModal.tsx src/features/transactions/TransactionsScreen.tsx
git commit -m "feat: revisar importacao de extrato"
```

### Task 5: Regressão e entrega

**Files:**
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes all units from Tasks 1–4.
- Produces evidence that the feature is ready and marks the roadmap with its actual completion status only after all checks pass.

- [ ] **Step 1: Run the complete test suites**

Run: `npm test; cd src-tauri; cargo test`

Expected: all TypeScript and Rust tests PASS.

- [ ] **Step 2: Run the release verification checklist**

Run: `npm run lint; npm run build; npm audit --omit=dev --audit-level=high; cd src-tauri; cargo check; git diff --check`

Expected: each command exits 0; if audit finds high severity findings, report them and do not claim release readiness.

- [ ] **Step 3: Update the roadmap only with verified evidence**

Replace the planned status of Fase 10 with completed only when Steps 1 and 2 pass; otherwise retain “planejada” and add no success evidence.

- [ ] **Step 4: Commit documentation and verified evidence**

```bash
git add ROADMAP.md
git commit -m "docs: registrar escopo de importacao"
```

## Plan self-review

- Spec coverage: Tasks 1–2 cover format, limits, normalization, duplicates and conflicts; Task 3 covers local atomic persistence, category creation, migration and telemetry; Task 4 covers review, category selection and accessibility; Task 5 covers the required verification and truthful roadmap status.
- Placeholder scan: no unresolved placeholders or deferred implementation language remains.
- Type consistency: `ParsedStatementRow` flows from Task 1 to Task 2; `ReconciliationCandidate` flows from Task 3 to Task 2/UI; `ApprovedImportLine` flows from the UI to Task 3.
