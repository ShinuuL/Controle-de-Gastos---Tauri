import { decodeCsv } from "./csvReader";
import { ITAU_DELIMITER, parseItauCsv } from "./itauCsv";
import { NUBANK_DELIMITER, parseNubankCsv } from "./nubankCsv";
import type { ParsedStatement } from "./statementValues";

export type CsvBank = "itau" | "nubank";

export const CSV_BANK_LABEL: Record<CsvBank, string> = {
  itau: "Itaú",
  nubank: "Nubank",
};

function firstLine(text: string): string {
  for (const line of text.split("\n")) {
    if (line.trim() !== "") return line;
  }
  return "";
}

/**
 * Decide o banco pelo delimitador do cabeçalho: o Itaú separa com `;` e o
 * Nubank com `,`. A contagem é feita só na primeira linha, que é sempre o
 * cabeçalho e nunca contém texto livre -- descrições com vírgula aparecem nas
 * linhas de dados e por isso não entram nessa conta.
 *
 * A escolha do banco tem de vir antes de ler qualquer valor: é ela que define
 * se "1.234" são mil duzentos e trinta e quatro reais (Itaú) ou um real e vinte
 * e três centavos (Nubank).
 */
export function detectCsvBank(text: string): CsvBank {
  const header = firstLine(text);
  const semicolons = header.split(ITAU_DELIMITER).length - 1;
  const commas = header.split(NUBANK_DELIMITER).length - 1;
  return commas > semicolons ? "nubank" : "itau";
}

export interface ParsedStatementWithBank extends ParsedStatement {
  bank: CsvBank;
}

export function parseStatementCsv(bytes: ArrayBuffer): ParsedStatementWithBank {
  const bank = detectCsvBank(decodeCsv(bytes));
  const parsed = bank === "nubank" ? parseNubankCsv(bytes) : parseItauCsv(bytes);
  return { ...parsed, bank };
}
