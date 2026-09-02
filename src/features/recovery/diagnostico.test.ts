import { describe, expect, it } from "vitest";
import {
  deveOferecerReparo,
  explicacaoDoEstado,
  linhasDoDiagnostico,
  type Diagnostico,
  type EstadoDoBanco,
} from "./diagnostico";
import { classifyDbFailure } from "../../lib/dbFailure";

const diagnostico = (over: Partial<Diagnostico> = {}): Diagnostico => ({
  state: "ok",
  divergentes: [],
  ausentes: [],
  sem_efeito: [],
  colunas_de_transacao_presentes: true,
  ...over,
});

describe("deveOferecerReparo", () => {
  /**
   * O incidente de 2026-09-01: a abertura falhou com `no such table: app_meta`,
   * consequência de uma migração que nunca rodou. A mensagem não bate com
   * nenhuma frase conhecida do sqlx, e a tela negava o reparo -- justamente no
   * aparelho em que o reparo era a resposta.
   */
  it("oferece reparo quando o schema diz que dá, mesmo com erro irreconhecível", () => {
    const falha = classifyDbFailure(
      "error returned from database: (code: 1) no such table: app_meta",
    );
    expect(falha.kind).toBe("desconhecida");

    expect(deveOferecerReparo(falha, diagnostico({ state: "reparavel" }))).toBe(true);
  });

  it("não oferece quando o schema diz que não dá, mesmo com erro conhecido", () => {
    const falha = classifyDbFailure(
      "migration 1 was previously applied but has been modified",
    );
    expect(deveOferecerReparo(falha, diagnostico({ state: "incerto" }))).toBe(false);
  });

  it("cai na mensagem quando o diagnóstico não roda", () => {
    const conhecida = classifyDbFailure(
      "migration 1 was previously applied but has been modified",
    );
    const desconhecida = classifyDbFailure("disk I/O error");
    expect(deveOferecerReparo(conhecida, null)).toBe(true);
    expect(deveOferecerReparo(desconhecida, null)).toBe(false);
  });
});

describe("linhasDoDiagnostico", () => {
  it("nomeia as versões de cada tipo de problema", () => {
    const linhas = linhasDoDiagnostico(
      diagnostico({ state: "reparavel", divergentes: [1], ausentes: [3], sem_efeito: [4, 6] }),
    );
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toContain("v1");
    expect(linhas[1]).toContain("v3");
    expect(linhas[2]).toContain("v4, v6");
  });

  it("omite as listas vazias em vez de dizer 'nenhuma'", () => {
    expect(linhasDoDiagnostico(diagnostico())).toEqual([]);
  });
});

describe("explicacaoDoEstado", () => {
  it("responde alguma coisa para todo estado", () => {
    const estados: EstadoDoBanco[] = ["sem-historico", "ok", "reparavel", "incerto"];
    for (const estado of estados) {
      expect(explicacaoDoEstado(estado).length).toBeGreaterThan(0);
    }
  });
});
