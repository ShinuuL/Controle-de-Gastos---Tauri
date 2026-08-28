/**
 * Classificacao da falha de inicializacao do banco local.
 *
 * A migracao roda dentro de `Database.load()` (comando `load` do
 * tauri-plugin-sql). O sqlx valida o SHA-384 de cada migracao ja aplicada e
 * aborta com VersionMismatch quando o SQL registrado difere do codigo atual --
 * foi o que aconteceu com quem instalou um build com a migracao v1 editada.
 *
 * Antes de a fase 12 existir, `preload` no tauri.conf.json fazia a migracao
 * rodar no setup do plugin Rust, onde a falha abortava a inicializacao do app
 * e a webview nunca carregava. Sem `preload`, o erro chega aqui como promise
 * rejeitada e vira uma tela de reparo em vez de um app morto.
 */

export type DbFailureKind =
  /** Migracao ja aplicada foi modificada: e o caso que o reparo trata. */
  | "migracao-divergente"
  /** Migracao registrada no banco que o codigo atual nao conhece (downgrade). */
  | "migracao-ausente-no-codigo"
  /** Qualquer outra falha: disco cheio, arquivo corrompido, permissao. */
  | "desconhecida";

export interface DbFailure {
  kind: DbFailureKind;
  /** Versao envolvida, quando a mensagem do sqlx informa. */
  version: number | null;
  /** Mensagem original, para exibir em detalhes e para suporte. */
  raw: string;
}

function mensagemDe(erro: unknown): string {
  if (typeof erro === "string") return erro;
  if (erro instanceof Error) return erro.message;
  return String(erro);
}

function versaoEm(raw: string): number | null {
  const m = /migration (\d+)/i.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}

export function classifyDbFailure(erro: unknown): DbFailure {
  const raw = mensagemDe(erro);
  const baixo = raw.toLowerCase();

  // Mensagens do sqlx (sqlx-core/src/migrate/error.rs).
  if (baixo.includes("previously applied but has been modified")) {
    return { kind: "migracao-divergente", version: versaoEm(raw), raw };
  }
  if (baixo.includes("previously applied but is missing in the resolved migrations")) {
    return { kind: "migracao-ausente-no-codigo", version: versaoEm(raw), raw };
  }

  return { kind: "desconhecida", version: null, raw };
}

/** Falhas que a tela de reparo sabe tratar. */
export function isRepairable(falha: DbFailure): boolean {
  return falha.kind === "migracao-divergente";
}
