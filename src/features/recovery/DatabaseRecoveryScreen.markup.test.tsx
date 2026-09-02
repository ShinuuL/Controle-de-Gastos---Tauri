import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DatabaseRecoveryScreen from "./DatabaseRecoveryScreen";
import { classifyDbFailure } from "../../lib/dbFailure";

// A tela chama `diagnose_database` no efeito, que não roda no render estático.
// O que este teste cobre é o primeiro quadro: o que a pessoa vê antes de o
// diagnóstico chegar -- e que não pode ser uma tela quebrada.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => ({})) }));

describe("DatabaseRecoveryScreen", () => {
  it("mostra a mensagem original para suporte, sempre", () => {
    const html = renderToStaticMarkup(
      <DatabaseRecoveryScreen
        falha={classifyDbFailure("no such table: app_meta")}
      />,
    );
    expect(html).toContain("no such table: app_meta");
    expect(html).toContain("Detalhes técnicos");
  });

  it("oferece o reparo quando a mensagem já denuncia a divergência", () => {
    const html = renderToStaticMarkup(
      <DatabaseRecoveryScreen
        falha={classifyDbFailure(
          "migration 1 was previously applied but has been modified",
        )}
      />,
    );
    expect(html).toContain("Reparar meus dados");
  });

  /**
   * Antes do diagnóstico chegar, um erro irreconhecível cai na classificação da
   * mensagem e não oferece reparo. É o comportamento antigo, e ele continua
   * valendo só para este instante -- o efeito troca por `deveOferecerReparo`.
   */
  it("não promete reparo antes de ter o diagnóstico", () => {
    const html = renderToStaticMarkup(
      <DatabaseRecoveryScreen falha={classifyDbFailure("disk I/O error")} />,
    );
    expect(html).not.toContain("Reparar meus dados");
    expect(html).toContain("disk I/O error");
  });
});
