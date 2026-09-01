/**
 * Conta na nuvem, vista do front.
 *
 * Nao ha `fetch` aqui, e nao deve haver: o AGENTS.md manda a nuvem passar por
 * comandos Rust tipados, e a spec da fase 11/17 estende isso a cripto. Senha,
 * KEK, DEK e token de sessao vivem no Rust; o que atravessa a ponte e so
 * e-mail, `account_id` e a validade da sessao.
 *
 * Contrato em `src-tauri/src/cloud.rs`.
 */

import { invoke } from "@tauri-apps/api/core";
import type { Entitlement } from "./session";

export interface Sessao {
  account_id: string;
  email: string;
  /** ISO 8601. Validade do TOKEN de sessao, nao do entitlement. */
  expires_at: string;
}

/** Erro vindo do Rust, ja traduzido para uma frase de tela. */
export interface CloudError {
  codigo: string;
  mensagem: string;
}

export function ehCloudError(erro: unknown): erro is CloudError {
  return (
    typeof erro === "object" &&
    erro !== null &&
    typeof (erro as CloudError).codigo === "string" &&
    typeof (erro as CloudError).mensagem === "string"
  );
}

/**
 * Mensagem para o usuario a partir de qualquer coisa que o `invoke` rejeite.
 * Um erro sem formato conhecido nao pode virar "[object Object]" em tela.
 */
export function mensagemDoErro(erro: unknown): string {
  if (ehCloudError(erro)) return erro.mensagem;
  return "Nao foi possivel concluir. Tente de novo.";
}

export function criarConta(email: string, senha: string): Promise<Sessao> {
  return invoke<Sessao>("cloud_signup", { email, senha });
}

export function entrar(email: string, senha: string): Promise<Sessao> {
  return invoke<Sessao>("cloud_login", { email, senha });
}

export function sair(): Promise<void> {
  return invoke<void>("cloud_logout");
}

/**
 * Sessao atual, sem rede. Hoje ela vive so na memoria do processo Rust, entao
 * isto devolve `null` depois de reabrir o app -- ver a nota sobre secure
 * storage em `cloud.rs`.
 */
export function sessaoAtual(): Promise<Sessao | null> {
  return invoke<Sessao | null>("cloud_sessao");
}

/**
 * Estado do pagamento. Tenta o servidor; sem rede, devolve o ultimo estado
 * guardado -- que so vale enquanto a carencia permitir (ver `decideAccess`).
 * Devolve `null` quando nunca houve entitlement neste aparelho.
 */
export function entitlementAtual(): Promise<Entitlement | null> {
  return invoke<Entitlement | null>("cloud_entitlement");
}

/**
 * Apaga a conta, as sessoes e o backup cifrado (LGPD art. 18).
 *
 * **Nao apaga os lancamentos deste aparelho** -- eles nunca sairam dele em
 * claro, e o app volta a ser o que era antes de existir conta. A confirmacao
 * vai como texto porque o Rust e o gateway a exigem: token valido sozinho nao
 * autoriza apagar conta.
 */
export function apagarConta(confirmacao: string): Promise<void> {
  return invoke<void>("cloud_apagar_conta", { confirmacao });
}
