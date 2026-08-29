import { normalizeAccents } from "./statementValues";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 10_000;

export interface CsvRecord {
  fields: string[];
  sourceRow: number;
}

export function decodeCsv(bytes: ArrayBuffer): string {
  if (bytes.byteLength === 0) throw new Error("Arquivo CSV vazio");
  if (bytes.byteLength > MAX_CSV_BYTES) throw new Error("Arquivo CSV excede o limite de 5 MiB");
  const text = (() => {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder("windows-1252").decode(bytes);
    }
  })().replace(/^\uFEFF/, "");
  if (!text.trim()) throw new Error("Arquivo CSV vazio");
  return text;
}

/**
 * Tokeniza respeitando aspas (RFC 4180) e mantém `sourceRow` na linha física em
 * que o registro começou, para que a prévia consiga apontar a linha do arquivo
 * mesmo quando uma descrição entre aspas ocupa várias linhas.
 */
export function readCsvRecords(text: string, delimiter: string): CsvRecord[] {
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
    } else if (character === delimiter) {
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
  return records.filter((item) => item.fields.some((value) => value.trim() !== ""));
}

export function normalizeHeader(value: string): string {
  return normalizeAccents(value.trim()).toLowerCase();
}

/** Localiza a primeira coluna presente entre os nomes aceitos. */
export function findColumn(header: string[], ...names: string[]): number | undefined {
  return names
    .map(normalizeHeader)
    .map((name) => header.indexOf(name))
    .find((index) => index >= 0);
}
