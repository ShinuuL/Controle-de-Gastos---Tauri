/**
 * Regra de acesso as funcoes pagas.
 *
 * Dois princípios fixados pelo desenvolvedor em 2026-08-29 mandam aqui, e valem
 * como critério de recusa:
 *
 * 1. Os dados continuam do usuário. Entitlement é control plane: ele decide o
 *    que a UI oferece, nunca o que o usuário pode ler ou gravar.
 * 2. O app continua simples. Não há segunda camada de telas -- quem não paga vê
 *    a tela de upgrade no lugar da função, e mais nada muda.
 *
 * Daí a regra que atravessa todo este arquivo: **o CRUD, o dashboard e os dados
 * nunca fecham.** Só função paga fecha. Trancar alguém fora dos próprios
 * registros financeiros está descartado, inclusive quando o pagamento venceu.
 */

/**
 * Estado do pagamento, como o servidor responde.
 *
 * `expirado` existe porque o trial da fase 20 vence e a fase 14 pode virar
 * assinatura -- a fase 13 tinha decidido compra única, em que só estorno tirava
 * o acesso, e isso deixou de valer.
 */
export type EntitlementStatus = "ativo" | "pendente" | "expirado" | "revogado" | "ausente";

/** Funções que o entitlement controla (fase 20). O resto do app é livre. */
export type FuncaoPaga = "importacao" | "orcamentos";

export interface Entitlement {
  status: EntitlementStatus;
  /** ISO 8601, ou null quando não vence. */
  expires_at: string | null;
  /** ISO 8601 carimbado pelo SERVIDOR. É daqui que a carência conta. */
  issued_at: string;
  /**
   * A resposta veio assinada e a assinatura confere?
   *
   * Um entitlement sem assinatura verificada serve para a sessão corrente, mas
   * não estende carência nenhuma: senão bastaria responder qualquer coisa de um
   * servidor falso para liberar por sete dias.
   */
  verificado: boolean;
}

/**
 * Quanto tempo o último estado conhecido vale sem rede.
 *
 * Sete dias porque o app é local-first e vendido como tal: exigir rede para
 * abrir uma função que já foi paga quebraria a promessa que sustenta o produto.
 */
export const CARENCIA_DIAS = 7;

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: "sem-conta" | "nao-pago" | "carencia-vencida" };

export function ehStatusAtivo(status: EntitlementStatus): boolean {
  return status === "ativo";
}

/**
 * Decide se uma função paga abre.
 *
 * Sem entitlement em mãos (nunca entrou, ou entrou e o app foi reaberto) a
 * função não abre -- mas o app inteiro continua funcionando, porque nada além
 * das funções pagas passa por aqui.
 */
export function decideAccess(params: {
  entitlement: Entitlement | null;
  now: Date;
}): AccessDecision {
  const { entitlement, now } = params;
  if (!entitlement) return { allowed: false, reason: "sem-conta" };

  if (!ehStatusAtivo(entitlement.status)) {
    return { allowed: false, reason: "nao-pago" };
  }

  // Um "ativo" que já passou da própria validade não é ativo. Isso cobre a
  // janela entre o vencimento e o servidor atualizar a linha: o app não precisa
  // esperar o webhook para parar de oferecer o que expirou.
  if (entitlement.expires_at) {
    const vence = Date.parse(entitlement.expires_at);
    if (Number.isNaN(vence) || vence <= now.getTime()) {
      return { allowed: false, reason: "nao-pago" };
    }
  }

  const emitido = Date.parse(entitlement.issued_at);
  if (Number.isNaN(emitido)) return { allowed: false, reason: "carencia-vencida" };

  // Sem assinatura conferida, o estado vale só enquanto está fresco: dá para
  // seguir usando na sessão em que ele chegou, não por uma semana.
  const dias = entitlement.verificado ? CARENCIA_DIAS : 0;
  const limite = emitido + dias * 86400000;

  // Carimbo no futuro significa relógio do aparelho atrasado ou resposta
  // forjada. Nos dois casos o certo é revalidar, não confiar.
  if (emitido > now.getTime() + 86400000) {
    return { allowed: false, reason: "carencia-vencida" };
  }
  if (now.getTime() > limite) return { allowed: false, reason: "carencia-vencida" };

  return { allowed: true };
}

/** Texto da tela de upgrade. Uma frase por motivo, sem jargão. */
export function motivoEmTexto(reason: Exclude<AccessDecision, { allowed: true }>["reason"]): string {
  switch (reason) {
    case "sem-conta":
      return "Entre na sua conta para usar esta função.";
    case "nao-pago":
      return "Esta função faz parte do plano pago.";
    case "carencia-vencida":
      return "Conecte-se à internet uma vez para confirmar seu acesso.";
  }
}
