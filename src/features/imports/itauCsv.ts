import {
  decodeCsv,
  findColumn,
  normalizeHeader,
  readCsvRecords,
  MAX_CSV_ROWS,
} from "./csvReader";
import {
  isBalanceDescription,
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

export const ITAU_DELIMITER = ";";

/**
 * Extrato do Itau, nos dois layouts que o banco emite: o do internet banking
 * (`Data;Histórico;Valor;Tipo`, valor sem sinal) e o exportado pelo app
 * (`data;lancamentos;valor (R$);saldo (R$)`, sinal embutido no valor).
 */
export function parseItauCsv(bytes: ArrayBuffer): ParsedStatement {
  const records = readCsvRecords(decodeCsv(bytes), ITAU_DELIMITER);
  if (records.length === 0) throw new Error("Arquivo CSV vazio");
  if (records[0].fields.length < 2) throw new Error("Formato CSV não suportado");

  const header = records[0].fields.map(normalizeHeader);
  const dateIndex = findColumn(header, "Data");
  // "Lançamentos" é o cabeçalho do extrato exportado pelo app; "Histórico" e
  // "Lançamento" são os do extrato do internet banking.
  const descriptionIndex = findColumn(header, "Histórico", "Lançamento", "Lançamentos");
  const amountIndex = findColumn(header, "Valor", "Valor (R$)");
  // Só o extrato do internet banking traz "Tipo". Sem ela, a natureza vem do
  // sinal do próprio valor.
  const typeIndex = findColumn(header, "Tipo");
  const categoryIndex = findColumn(header, "Categoria");
  if (dateIndex === undefined || descriptionIndex === undefined || amountIndex === undefined) {
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
