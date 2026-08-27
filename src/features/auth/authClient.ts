/**
 * PLACEHOLDER -- autenticacao e consulta de entitlement.
 *
 * Contrato pretendido com o backend (mesma conta do site e do app):
 *
 *   POST /v1/auth/login      { email, senha }        -> { token, session }
 *   POST /v1/auth/refresh    { token }               -> { token, session }
 *   GET  /v1/me/entitlement  Authorization: Bearer   -> { status, expires_at }
 *
 * O entitlement devolvido aqui serve so para a UI. A autoridade e o backend:
 * toda rota de dados revalida o pagamento antes de responder, porque um
 * cliente pode ser modificado.
 */

import { NotConfiguredError, endpoint, isConfigured } from "../../lib/cloud/gateway";
import type { EntitlementStatus, Session } from "./session";

export interface Credentials {
  email: string;
  senha: string;
}

export async function login(_credentials: Credentials): Promise<Session> {
  if (!isConfigured()) throw new NotConfiguredError("login");
  // TODO(fase 13): POST endpoint("/v1/auth/login"), guardar token no
  // secure storage do SO (nao em localStorage) e devolver a sessao.
  throw new NotConfiguredError("login");
}

export async function logout(): Promise<void> {
  if (!isConfigured()) throw new NotConfiguredError("logout");
  // TODO(fase 13): invalidar o token no backend e limpar o storage local.
  throw new NotConfiguredError("logout");
}

export async function restoreSession(): Promise<Session | null> {
  // Sem backend configurado nao ha sessao para restaurar. Devolve null em vez
  // de lancar, porque isso roda no boot do app e nao pode derrubar a tela.
  if (!isConfigured()) return null;
  // TODO(fase 13): ler token do secure storage e chamar /v1/auth/refresh.
  return null;
}

export async function fetchEntitlement(): Promise<EntitlementStatus> {
  if (!isConfigured()) throw new NotConfiguredError("fetchEntitlement");
  // TODO(fase 14): GET endpoint("/v1/me/entitlement") apos o webhook do
  // Stripe/PIX confirmar o pagamento.
  void endpoint;
  throw new NotConfiguredError("fetchEntitlement");
}
