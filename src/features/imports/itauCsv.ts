import {
  isBalanceDescription,
  normalizeAccents,
  parseSignedAmount,
  parseStatementDate,
  type ParsedStatement,
  type ParsedStatementRow,
  type StatementIssue,
} from "./statementValues";

export type {
  ParsedNature,
  ParsedStatement,
  ParsedStatementRow,
} from "./statementValues";
export type { StatementIssue as CsvIssue } from "./statementValues";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10_000;

function decode(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes).replace(/^\uFEFF/, "");
  }
}

interface CsvRecord {
  fields: string[];
  sourceRow: number;
}

function recordsOf(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordStartLine = 1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
        if (character === "\n") line += 1;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ";") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      records.push({ fields: record, sourceRow: recordStartLine });
      record = [];
      field = "";
      line += 1;
      recordStartLine = line;
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Formato CSV não suportado: campo entre aspas não foi encerrado");
  if (field.length > 0 || record.length > 0) {
    record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    records.push({ fields: record, sourceRow: recordStartLine });
  }
  return records;
}

function normalizeHeader(value: string): string {
  return normalizeAccents(value.trim()).toLowerCase();
}

export function parseItauCsv(bytes: ArrayBuffer): ParsedStatement {
  if (bytes.byteLength === 0) throw new Error("Arquivo CSV vazio");
  if (bytes.byteLength > MAX_BYTES) throw new Error("Arquivo CSV excede o limite de 5 MiB");
  const text = decode(bytes);
  if (!text.trim()) throw new Error("Arquivo CSV vazio");

  const records = recordsOf(text).filter((record) => record.fields.some((field) => field.trim() !== ""));
  if (records.length === 0) throw new Error("Arquivo CSV vazio");
  if (records[0].fields.length < 2) throw new Error("Formato CSV não suportado");
  const header = records[0].fields.map(normalizeHeader);
  const find = (...names: string[]) => names.map(normalizeHeader).map((name) => header.indexOf(name)).find((index) => index >= 0);
  const dateIndex = find("Data");
  // "Lançamentos" é o cabeçalho do extrato exportado pelo app; "Histórico" e
  // "Lançamento" são os do extrato do internet banking.
  const descriptionIndex = find("Histórico", "Lançamento", "Lançamentos");
  const amountIndex = find("Valor", "Valor (R$)");
  // Só o extrato do internet banking traz "Tipo". Sem ela, a natureza vem do
  // sinal do próprio valor.
  const typeIndex = find("Tipo");
  const categoryIndex = find("Categoria");
  if (dateIndex === undefined || descriptionIndex === undefined || amountIndex === undefined) {
    throw new Error("Cabeçalho CSV inválido: colunas obrigatórias ausentes");
  }
  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_ROWS) throw new Error("Arquivo CSV excede o limite de 10.000 linhas");

  const rows: ParsedStatementRow[] = [];
  const issues: StatementIssue[] = [];
  dataRecords.forEach((record) => {
    const sourceRow = record.sourceRow;
    const rawAmount = (record.fields[amountIndex] ?? "").trim();
    const description = (record.fields[descriptionIndex] ?? "").trim();
    // Linha de saldo: descrição de saldo, ou valor vazio porque o número está
    // na coluna "saldo (R$)". Nenhuma das duas é lançamento.
    if (isBalanceDescription(description) || rawAmount === "") return;

    const date = parseStatementDate(record.fields[dateIndex] ?? "");
    const amount = parseSignedAmount(rawAmount);
    const type = typeIndex === undefined ? null : (record.fields[typeIndex] ?? "").trim().toUpperCase();
    if (!date) {
      issues.push({ sourceRow, message: "Data inválida" });
    } else if (amount === null) {
      issues.push({ sourceRow, message: "Valor inválido" });
    } else if (type !== null && type !== "C" && type !== "D") {
      issues.push({ sourceRow, message: "Tipo inválido: esperado C ou D" });
    } else if (!description) {
      issues.push({ sourceRow, message: "Descrição inválida" });
    } else {
      const category = categoryIndex === undefined ? undefined : record.fields[categoryIndex]?.trim();
      rows.push({
        sourceRow,
        date,
        description,
        amount_cents: amount.amount_cents,
        nature: type === null ? amount.nature : type === "C" ? "entrada" : "saida",
        ...(category ? { suggestedCategoryName: category } : {}),
      });
    }
  });
  return { rows, issues };
}
