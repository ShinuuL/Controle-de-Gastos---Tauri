/**
 * Atualizacao pelo proprio app, vista do front (fase 21).
 *
 * Como na nuvem, nao ha `fetch` aqui: manifesto, assinatura Ed25519, sha256 e
 * download vivem no Rust (`src-tauri/src/update.rs`), e a instalacao passa pelo
 * plugin Android (`src-tauri/src/instalador.rs`). O front so pergunta e mostra.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type EstadoAtualizacao =
  | {
      kind: "disponivel";
      versao: string;
      notas: string;
      bytes: number;
      obrigatoria: boolean;
      arquivo: string;
    }
  | { kind: "em_dia"; versao: string }
  | { kind: "cedo"; faltam_segundos: number }
  | { kind: "dispensada"; versao: string }
  | { kind: "indisponivel"; motivo: string };

export interface ArquivoBaixado {
  caminho: string;
  bytes: number;
  versao: string;
}

export interface PermissaoInstalacao {
  permitido: boolean;
  pedivel: boolean;
}

export interface ErroUpdate {
  codigo: string;
  mensagem: string;
}

export function ehErroUpdate(erro: unknown): erro is ErroUpdate {
  return (
    typeof erro === "object" &&
    erro !== null &&
    typeof (erro as ErroUpdate).codigo === "string" &&
    typeof (erro as ErroUpdate).mensagem === "string"
  );
}

export function mensagemDoErro(erro: unknown): string {
  if (ehErroUpdate(erro)) return erro.mensagem;
  return "Não foi possível concluir. Tente de novo.";
}

/** Consulta o manifesto assinado. `forcar` ignora a janela de um dia. */
export function verificarAtualizacao(forcar = false): Promise<EstadoAtualizacao> {
  return invoke<EstadoAtualizacao>("atualizacao_verificar", { forcar });
}

/** Para de oferecer esta versão. A próxima volta a aparecer. */
export function dispensarVersao(versao: string): Promise<void> {
  return invoke<void>("atualizacao_dispensar", { versao });
}

/** Baixa e confere o arquivo. Só devolve caminho se o sha256 bater. */
export function baixarAtualizacao(): Promise<ArquivoBaixado> {
  return invoke<ArquivoBaixado>("atualizacao_baixar");
}

export function permissaoDeInstalacao(): Promise<PermissaoInstalacao> {
  return invoke<PermissaoInstalacao>("instalador_permissao");
}

export function pedirPermissaoDeInstalacao(): Promise<void> {
  return invoke<void>("instalador_pedir_permissao");
}

export function abrirInstalador(caminho: string): Promise<void> {
  return invoke<void>("instalador_abrir", { caminho });
}

/**
 * Acompanha o download. O Rust emite um evento por MB -- o suficiente para a
 * barra andar sem inundar a ponte a cada pedaco de rede.
 */
export function ouvirProgresso(
  aoProgredir: (baixados: number, total: number) => void,
): Promise<() => void> {
  return listen<[number, number]>("atualizacao://progresso", (evento) => {
    const [baixados, total] = evento.payload;
    aoProgredir(baixados, total);
  });
}
