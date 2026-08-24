export type ParsedNature = "entrada" | "saida";

export interface ParsedStatementRow {
  sourceRow: number;
  date: string;
  description: string;
  amount_cents: number;
  nature: ParsedNature;
  suggestedCategoryName?: string;
}

export interface CsvIssue {
  sourceRow: number;
  message: string;
}

export interface ParsedStatement {
  rows: ParsedStatementRow[];
  issues: CsvIssue[];
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10_000;

function decode(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes).replace(/^\uFEFF/, "");
  }
}

function recordsOf(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

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
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ";") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Formato CSV não suportado: campo entre aspas não foi encerrado");
  if (field.length > 0 || record.length > 0) {
    record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    records.push(record);
  }
  return records;
}

function normalizeHeader(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function parseDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseAmount(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "");
  if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimal = ""] = normalized.replace(/\./g, "").split(",");
  const cents = Number(`${whole}${decimal.padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function parseItauCsv(bytes: ArrayBuffer): ParsedStatement {
  if (bytes.byteLength === 0) throw new Error("Arquivo CSV vazio");
  if (bytes.byteLength > MAX_BYTES) throw new Error("Arquivo CSV excede o limite de 5 MiB");
  const text = decode(bytes);
  if (!text.trim()) throw new Error("Arquivo CSV vazio");

  const records = recordsOf(text).filter((record) => record.some((field) => field.trim() !== ""));
  if (records.length === 0) throw new Error("Arquivo CSV vazio");
  if (records[0].length < 2) throw new Error("Formato CSV não suportado");
  const header = records[0].map(normalizeHeader);
  const find = (...names: string[]) => names.map(normalizeHeader).map((name) => header.indexOf(name)).find((index) => index >= 0);
  const dateIndex = find("Data");
  const descriptionIndex = find("Histórico", "Lançamento");
  const amountIndex = find("Valor");
  const typeIndex = find("Tipo");
  const categoryIndex = find("Categoria");
  if (dateIndex === undefined || descriptionIndex === undefined || amountIndex === undefined || typeIndex === undefined) {
    throw new Error("Cabeçalho CSV inválido: colunas obrigatórias ausentes");
  }
  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_ROWS) throw new Error("Arquivo CSV excede o limite de 10.000 linhas");

  const rows: ParsedStatementRow[] = [];
  const issues: CsvIssue[] = [];
  dataRecords.forEach((record, offset) => {
    const sourceRow = offset + 2;
    const date = parseDate(record[dateIndex] ?? "");
    const amount = parseAmount(record[amountIndex] ?? "");
    const type = (record[typeIndex] ?? "").trim().toUpperCase();
    const description = (record[descriptionIndex] ?? "").trim();
    if (!date) {
      issues.push({ sourceRow, message: "Data inválida" });
    } else if (amount === null) {
      issues.push({ sourceRow, message: "Valor inválido" });
    } else if (type !== "C" && type !== "D") {
      issues.push({ sourceRow, message: "Tipo inválido: esperado C ou D" });
    } else if (!description) {
      issues.push({ sourceRow, message: "Descrição inválida" });
    } else {
      const category = categoryIndex === undefined ? undefined : record[categoryIndex]?.trim();
      rows.push({ sourceRow, date, description, amount_cents: amount, nature: type === "C" ? "entrada" : "saida", ...(category ? { suggestedCategoryName: category } : {}) });
    }
  });
  return { rows, issues };
}
