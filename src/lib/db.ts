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
  let falha: unknown = null;

  return async () => {
    if (db) return db;
    // Uma abertura que falhou não se tenta de novo: o `load` do plugin-sql
    // **consome** a lista de migrações na primeira chamada (`remove` no mapa),
    // então a segunda abre o banco sem migrar nada. O erro que ela produz é
    // sempre a jusante -- uma tabela que a migração pendente criaria --, e é
    // esse erro que chega à tela, escondendo a falha real. Guardar a primeira
    // é o que mantém a causa visível.
    if (falha !== null) throw falha;
    if (!initializing) {
      initializing = (async () => {
        const loadedDb = await dependencies.load(DB_PATH);
        await loadedDb.execute("PRAGMA foreign_keys = ON");
        await dependencies.seed(loadedDb);
        db = loadedDb;
        return loadedDb;
      })()
        .catch((erro: unknown) => {
          falha = erro ?? new Error("Falha desconhecida ao abrir o banco.");
          throw erro;
        })
        .finally(() => {
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
