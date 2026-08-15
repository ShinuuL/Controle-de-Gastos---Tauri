import Database from "@tauri-apps/plugin-sql";
import { seedPresetCategories } from "./repositories/presets";

export const DB_PATH = "sqlite:controle-de-gastos.db";

type DatabaseConnection = Pick<Database, "execute">;

interface DbDependencies<T extends DatabaseConnection> {
  load: (path: string) => Promise<T>;
  seed: (db: T) => Promise<void>;
}

export function createDbGetter<T extends DatabaseConnection>(
  dependencies: DbDependencies<T>,
): () => Promise<T> {
  let db: T | null = null;
  let initializing: Promise<T> | null = null;

  return async () => {
    if (db) return db;
    if (!initializing) {
      initializing = (async () => {
        const loadedDb = await dependencies.load(DB_PATH);
        await loadedDb.execute("PRAGMA foreign_keys = ON");
        await dependencies.seed(loadedDb);
        db = loadedDb;
        return loadedDb;
      })().finally(() => {
        initializing = null;
      });
    }
    return initializing;
  };
}

const databaseGetter = createDbGetter<Database>({
  load: (path) => Database.load(path),
  seed: seedPresetCategories,
});

export async function getDb(): Promise<Database> {
  return databaseGetter();
}
