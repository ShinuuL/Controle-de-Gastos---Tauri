import { describe, expect, it } from "vitest";
import { decideAccess, type Session } from "./session";

const AGORA = new Date("2026-08-27T12:00:00Z");

function sessao(over: Partial<Session> = {}): Session {
  return {
    user_id: "u1",
    email: "a@b.com",
    entitlement: "ativo",
    expires_at: "2026-09-27T12:00:00Z",
    ...over,
  };
}

describe("decideAccess", () => {
  it("libera sempre no canal direct, mesmo sem sessao", () => {
    expect(decideAccess({ channel: "direct", session: null, now: AGORA }))
      .toEqual({ allowed: true });
  });

  it("libera no canal direct mesmo com pagamento ausente", () => {
    const s = sessao({ entitlement: "ausente" });
    expect(decideAccess({ channel: "direct", session: s, now: AGORA }))
      .toEqual({ allowed: true });
  });

  it("exige login no canal gated sem sessao", () => {
    expect(decideAccess({ channel: "gated", session: null, now: AGORA }))
      .toEqual({ allowed: false, reason: "login" });
  });

  it("exige pagamento quando o entitlement nao esta ativo", () => {
    for (const e of ["pendente", "expirado", "ausente"] as const) {
      expect(decideAccess({ channel: "gated", session: sessao({ entitlement: e }), now: AGORA }))
        .toEqual({ allowed: false, reason: "pagamento" });
    }
  });

  it("bloqueia sessao expirada antes de olhar o pagamento", () => {
    const s = sessao({ expires_at: "2026-08-01T00:00:00Z" });
    expect(decideAccess({ channel: "gated", session: s, now: AGORA }))
      .toEqual({ allowed: false, reason: "sessao-expirada" });
  });

  it("trata data invalida como sessao expirada", () => {
    const s = sessao({ expires_at: "nao-e-data" });
    expect(decideAccess({ channel: "gated", session: s, now: AGORA }))
      .toEqual({ allowed: false, reason: "sessao-expirada" });
  });

  it("libera no canal gated com sessao valida e pagamento ativo", () => {
    expect(decideAccess({ channel: "gated", session: sessao(), now: AGORA }))
      .toEqual({ allowed: true });
  });
});
