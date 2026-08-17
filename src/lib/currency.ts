const formatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(cents: number): string {
  return formatter.format(cents / 100);
}

/** Formata centavos com sinal explícito: entrada "+R$", saída "−R$" (U+2212), zero sem sinal. */
export function formatSignedBRL(cents: number): string {
  if (cents === 0) return formatBRL(0);
  return cents > 0 ? `+${formatBRL(cents)}` : `−${formatBRL(-cents)}`;
}

export function formatCentsInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function parseToCents(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/^r\$\s?/i, "")
    .replace(/\s/g, "");
  if (!cleaned) return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let integerPart = cleaned;
  let decimalPart = "";

  if (hasComma || hasDot) {
    const lastSep = Math.max(
      cleaned.lastIndexOf(","),
      cleaned.lastIndexOf("."),
    );
    const sepChar = cleaned[lastSep];
    integerPart = cleaned.slice(0, lastSep);
    decimalPart = cleaned.slice(lastSep + 1);
    const otherSep = sepChar === "," ? "." : ",";
    integerPart = integerPart.split(otherSep).join("");
  }

  const digits = (str: string) => str.replace(/[^\d]/g, "");
  const cents =
    Number(digits(integerPart)) * 100 +
    Number(digits(decimalPart).slice(0, 2).padEnd(2, "0"));
  return Number.isFinite(cents) ? cents : null;
}
