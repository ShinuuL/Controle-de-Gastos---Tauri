import { getDb } from "../db";
import type { MovementNature, MovementStatus } from "../types";

export function validateDescription(description: string): string {
  if (typeof description !== "string") {
    throw new Error("Informe uma descrição válida.");
  }
  const value = description.trim();
  if (value.length > 500)
    throw new Error("A descrição deve ter no máximo 500 caracteres.");
  return value;
}

export function validateAmount(amountCents: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error("Informe um valor válido maior que zero.");
  }
  return amountCents;
}

export function validateDate(date: string): string {
  if (typeof date !== "string") throw new Error("Informe uma data válida.");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Informe uma data válida.");
  const [year, month, day] = match.slice(1).map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new Error("Informe uma data válida.");
  }
  return date;
}

export async function validateCategoryId(categoryId: string): Promise<string> {
  if (typeof categoryId !== "string") {
    throw new Error("Informe uma categoria válida.");
  }
  const value = categoryId.trim();
  if (!value) throw new Error("Informe uma categoria válida.");
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    "SELECT id FROM categories WHERE id = $1",
    [value],
  );
  if (!rows[0]) throw new Error("Categoria não encontrada.");
  return value;
}

export function validateNature(nature: unknown): MovementNature {
  if (nature !== "entrada" && nature !== "saida") {
    throw new Error("Informe uma natureza válida.");
  }
  return nature;
}

export function validateStatus(status: unknown): MovementStatus {
  if (status !== "previsto" && status !== "realizado") {
    throw new Error("Informe um status válido.");
  }
  return status;
}
