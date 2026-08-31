/**
 * Backup do banco na nuvem.
 *
 * Modelo local-first: o SQLite continua sendo a fonte de leitura e o app
 * funciona offline. A nuvem e **replica e ponto de restauracao**, nao um segundo
 * caminho de leitura -- por isso nada aqui devolve lancamento nenhum, so bytes
 * que ja saem cifrados do Rust.
 *
 * O que sobe e o `.db` inteiro dentro de um envelope cifrado no aparelho. O
 * servidor guarda um arquivo opaco: nao ha merge no servidor porque nao ha como
 * ele ler o que esta guardando.
 */

import { invoke } from "@tauri-apps/api/core";

export type SyncState =
  | { kind: "desligado" }
  | { kind: "sincronizando" }
  | { kind: "sincronizado"; at: string; version: number }
  | { kind: "conflito"; versionServidor: number; versionLocal: number }
  | { kind: "erro"; message: string };

export const SYNC_STATE_INICIAL: SyncState = { kind: "desligado" };

export type ResultadoPush =
  | { kind: "enviado"; version: number; bytes: number }
  /**
   * Outro aparelho gravou depois da ultima sincronizacao deste.
   *
   * O app **nao funde e nao sobrescreve**: mostra as duas versoes e deixa a
   * escolha com o usuario. Fundir dois bancos inteiros que o servidor nao
   * consegue ler e o problema mais caro do projeto, e continua adiado de
   * proposito -- ver a spec da fase 11/17.
   */
  | { kind: "conflito"; version_servidor: number; version_local: number };

export interface ResultadoPull {
  version: number;
  bytes: number;
  /**
   * Sempre true. O banco baixado espera em disco e a troca acontece no proximo
   * boot: trocar o arquivo com o SQLite aberto corrompe o banco de formas que
   * so aparecem depois.
   */
  exige_reinicio: boolean;
}

/** Sobe o banco cifrado. Exige sessao aberta. */
export function enviarBackup(): Promise<ResultadoPush> {
  return invoke<ResultadoPush>("cloud_backup_push");
}

/** Baixa e decifra o backup. O app precisa ser reiniciado depois. */
export function restaurarBackup(): Promise<ResultadoPull> {
  return invoke<ResultadoPull>("cloud_backup_pull");
}

export type ResultadoAuto =
  | { kind: "enviado"; version: number }
  | { kind: "cedo"; faltam_segundos: number }
  | { kind: "sem_sessao" }
  | { kind: "adiado"; motivo: string };

/**
 * Sobe o backup se ja passou tempo suficiente desde o ultimo envio.
 *
 * Nunca rejeita por falha de backup: sem rede, com conflito ou com o servidor
 * fora do ar, devolve `adiado`. Backup em segundo plano nao pode virar popup --
 * os dados estao no aparelho e o proximo gatilho tenta de novo.
 */
export function backupAutomatico(): Promise<ResultadoAuto> {
  return invoke<ResultadoAuto>("cloud_backup_auto");
}
