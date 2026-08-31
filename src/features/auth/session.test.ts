import { describe, expect, it } from "vitest";
import {
  CARENCIA_DIAS,
  decideAccess,
  motivoEmTexto,
  type Entitlement,
  type EntitlementStatus,
} from "./session";

const AGORA = new Date("2026-08-29T12:00:00.000Z");

function diasAtras(dias: number): string {
  return new Date(AGORA.getTime() - dias * 86400000).toISOString();
}

function ent(over: Partial<Entitlement> = {}): Entitlement {
  return {
    status: "ativo",
    expires_at: null,
    issued_at: AGORA.toISOString(),
    verificado: true,
    ...over,
  };
}

describe("decideAccess", () => {
  it("libera entitlement ativo e recem-verificado", () => {
    expect(decideAccess({ entitlement: ent(), now: AGORA })).toEqual({ allowed: true });
  });

  it("sem entitlement em maos, a funcao paga nao abre", () => {
    expect(decideAccess({ entitlement: null, now: AGORA })).toEqual({
      allowed: false,
      reason: "sem-conta",
    });
  });

  it.each<EntitlementStatus>(["pendente", "expirado", "revogado", "ausente"])(
    "status %s nao libera",
    (status) => {
      const d = decideAccess({ entitlement: ent({ status }), now: AGORA });
      expect(d).toEqual({ allowed: false, reason: "nao-pago" });
    },
  );

  it("ativo com validade no futuro libera", () => {
    const futuro = new Date(AGORA.getTime() + 86400000).toISOString();
    expect(decideAccess({ entitlement: ent({ expires_at: futuro }), now: AGORA })).toEqual({
      allowed: true,
    });
  });

  it("ativo ja vencido nao libera, mesmo antes de o servidor atualizar", () => {
    // Cobre a janela entre o vencimento do trial e o webhook mudar a linha.
    const ontem = new Date(AGORA.getTime() - 86400000).toISOString();
    expect(decideAccess({ entitlement: ent({ expires_at: ontem }), now: AGORA })).toEqual({
      allowed: false,
      reason: "nao-pago",
    });
  });

  it("validade ilegivel e tratada como vencida", () => {
    const d = decideAccess({ entitlement: ent({ expires_at: "amanha talvez" }), now: AGORA });
    expect(d).toEqual({ allowed: false, reason: "nao-pago" });
  });
});

describe("carencia offline", () => {
  it("vale ate o ultimo dia da janela", () => {
    const quaseNoLimite = ent({ issued_at: diasAtras(CARENCIA_DIAS - 0.01) });
    expect(decideAccess({ entitlement: quaseNoLimite, now: AGORA })).toEqual({ allowed: true });
  });

  it("passou da janela, pede internet", () => {
    const velho = ent({ issued_at: diasAtras(CARENCIA_DIAS + 0.01) });
    expect(decideAccess({ entitlement: velho, now: AGORA })).toEqual({
      allowed: false,
      reason: "carencia-vencida",
    });
  });

  it("sem assinatura conferida nao ha carencia", () => {
    // Senao bastaria um servidor falso responder qualquer coisa para liberar
    // sete dias de funcao paga.
    const semAssinatura = ent({ verificado: false, issued_at: diasAtras(0.5) });
    expect(decideAccess({ entitlement: semAssinatura, now: AGORA })).toEqual({
      allowed: false,
      reason: "carencia-vencida",
    });
  });

  it("sem assinatura, mas recem-chegado, ainda vale na sessao corrente", () => {
    const agorinha = ent({ verificado: false, issued_at: AGORA.toISOString() });
    expect(decideAccess({ entitlement: agorinha, now: AGORA })).toEqual({ allowed: true });
  });

  it("carimbo no futuro nao estica a carencia", () => {
    // Relogio atrasado ou resposta forjada: nos dois casos, revalidar.
    const futuro = ent({ issued_at: new Date(AGORA.getTime() + 3 * 86400000).toISOString() });
    expect(decideAccess({ entitlement: futuro, now: AGORA })).toEqual({
      allowed: false,
      reason: "carencia-vencida",
    });
  });

  it("tolera pequeno adiantamento do relogio", () => {
    // Uma hora a frente e desalinhamento comum de aparelho, nao fraude.
    const pouquinho = ent({ issued_at: new Date(AGORA.getTime() + 3600000).toISOString() });
    expect(decideAccess({ entitlement: pouquinho, now: AGORA })).toEqual({ allowed: true });
  });

  it("issued_at ilegivel nao libera", () => {
    const quebrado = ent({ issued_at: "ontem de manha" });
    expect(decideAccess({ entitlement: quebrado, now: AGORA })).toEqual({
      allowed: false,
      reason: "carencia-vencida",
    });
  });
});

describe("motivoEmTexto", () => {
  it("cobre todos os motivos, sem jargao", () => {
    for (const reason of ["sem-conta", "nao-pago", "carencia-vencida"] as const) {
      const texto = motivoEmTexto(reason);
      expect(texto.length).toBeGreaterThan(10);
      expect(texto).not.toMatch(/entitlement|token|401/i);
    }
  });
});
