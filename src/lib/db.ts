import Database from "@tauri-apps/plugin-sql";
import { seedPresetCategories } from "./repositories/presets";

export const DB_PATH = "sqlite:controle-de-gastos.db";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load(DB_PATH);
    await seedPresetCategories(db);
  }
  return db;
}
