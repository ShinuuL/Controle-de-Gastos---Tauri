/**
 * PLACEHOLDER -- sincronizacao do banco com a nuvem.
 *
 * AGENTS.md: "uma futura nuvem deve usar comandos Rust tipados como autoridade
 * do banco" e "evitar misturar acesso local e remoto no frontend". Por isso o
 * frontend continua falando so com os repositorios em src/lib/repositories/;
 * a sincronizacao entra por baixo, no Rust, e nao como um segundo caminho de
 * leitura no React.
 *
 * Modelo pretendido: local-first. O SQLite continua sendo a fonte de leitura
 * (o app funciona offline); a nuvem e replica e ponto de restauracao.
 */

export type SyncState =
  | { kind: "desligado" }
  | { kind: "sincronizando" }
  | { kind: "sincronizado"; at: string }
  | { kind: "erro"; message: string };

export const SYNC_STATE_INICIAL: SyncState = { kind: "desligado" };

export async function pushChanges(): Promise<never> {
  throw new Error("sync.pushChanges: nao implementado (fase 12)");
}

export async function pullChanges(): Promise<never> {
  throw new Error("sync.pullChanges: nao implementado (fase 12)");
}
