import {
  decodeCsv,
  findColumn,
  normalizeHeader,
  readCsvRecords,
  MAX_CSV_ROWS,
} from "./csvReader";
import {
  parseSignedDotAmount,
  parseStatementDate,
  type ParsedStatement,
  type ParsedStatementRow,
  type StatementIssue,
} from "./statementValues";

export const NUBANK_DELIMITER = ",";

/**
 * Extrato de conta do Nubank: `Data,Valor,Identificador,Descrição`.
 *
 * Difere do Itaú em tres pontos, e e por isso que vive em arquivo proprio:
 * delimitador virgula, decimal com ponto (14.00) e coluna `Descrição`. Em
 * compensacao nao tem linha de saldo para descartar e a natureza sempre vem do
 * sinal, entao nao ha coluna `Tipo` a interpretar.
 */
export function parseNubankCsv(bytes: ArrayBuffer): ParsedStatement {
  const records = readCsvRecords(decodeCsv(bytes), NUBANK_DELIMITER);
  if (records.length === 0) throw new Error("Arquivo CSV vazio");
  if (records[0].fields.length < 2) throw new Error("Formato CSV não suportado");

  const header = records[0].fields.map(normalizeHeader);
  const dateIndex = findColumn(header, "Data");
  const amountIndex = findColumn(header, "Valor");
  const descriptionIndex = findColumn(header, "Descrição");
  if (dateIndex === undefined || amountIndex === undefined || descriptionIndex === undefined) {
    throw new Error("Cabeçalho CSV inválido: colunas obrigatórias ausentes");
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_CSV_ROWS) {
    throw new Error("Arquivo CSV excede o limite de 10.000 linhas");
  }

  const rows: ParsedStatementRow[] = [];
  const issues: StatementIssue[] = [];
  dataRecords.forEach((record) => {
    const sourceRow = record.sourceRow;
    const date = parseStatementDate(record.fields[dateIndex] ?? "");
    const amount = parseSignedDotAmount(record.fields[amountIndex] ?? "");
    const description = (record.fields[descriptionIndex] ?? "").trim();

    if (!date) {
      issues.push({ sourceRow, message: "Data inválida" });
    } else if (amount === null) {
      issues.push({ sourceRow, message: "Valor inválido" });
    } else if (!description) {
      issues.push({ sourceRow, message: "Descrição inválida" });
    } else {
      rows.push({
        sourceRow,
        date,
        description,
        amount_cents: amount.amount_cents,
        nature: amount.nature,
      });
    }
  });

  return { rows, issues };
}
