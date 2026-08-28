import type { DistributionChannel } from "../../lib/cloud/distribution";
import { requiresAuth } from "../../lib/cloud/distribution";

/**
 * Estado do pagamento, conforme respondido pelo backend.
 *
 * Compra unica (decidido em 2026-08-27): o entitlement nao vence, entao nao ha
 * estado "expirado". "revogado" cobre estorno/chargeback -- no PIX via MED, no
 * cartao via contestacao -- que sao a unica forma de um acesso pago ser perdido.
 */
export type EntitlementStatus = "ativo" | "pendente" | "revogado" | "ausente";

export interface Session {
  user_id: string;
  email: string;
  /**
   * Copia local do entitlement, apenas para decidir o que a UI mostra.
   * NAO e autoridade: o backend revalida a cada requisicao de dados.
   */
  entitlement: EntitlementStatus;
  /**
   * ISO 8601. Validade do TOKEN DE SESSAO, nao do entitlement -- a compra e
   * vitalicia, mas o login ainda precisa ser renovado.
   */
  expires_at: string;
}

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: "login" | "pagamento" | "sessao-expirada" };

/**
 * Decide se as telas do app liberam.
 *
 * Regra de negocio combinada:
 *   - canal direct  -> sempre libera (APK distribuido por fora, 100% local);
 *   - canal gated   -> exige sessao valida E entitlement ativo.
 */
export function decideAccess(params: {
  channel: DistributionChannel;
  session: Session | null;
  now: Date;
}): AccessDecision {
  const { channel, session, now } = params;

  if (!requiresAuth(channel)) return { allowed: true };
  if (!session) return { allowed: false, reason: "login" };

  if (Number.isNaN(Date.parse(session.expires_at))) {
    return { allowed: false, reason: "sessao-expirada" };
  }
  if (Date.parse(session.expires_at) <= now.getTime()) {
    return { allowed: false, reason: "sessao-expirada" };
  }
  if (session.entitlement !== "ativo") {
    return { allowed: false, reason: "pagamento" };
  }

  return { allowed: true };
}
