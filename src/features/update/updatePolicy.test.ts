import { describe, expect, it } from "vitest";
import {
  deveOferecer,
  formatarTamanho,
  passoAoAceitar,
  percentual,
  podeDispensar,
  rotuloDoDownload,
  mensagemDaChecagem,
} from "./updatePolicy";
import type { EstadoAtualizacao } from "./updateClient";

const oferta = (over: Partial<Extract<EstadoAtualizacao, { kind: "disponivel" }>> = {}) =>
  ({
    kind: "disponivel",
    versao: "0.6.0",
    notas: "",
    bytes: 87_920_201,
    obrigatoria: false,
    arquivo: "contr0l-0.6.0.apk",
    ...over,
  }) satisfies EstadoAtualizacao;

describe("deveOferecer", () => {
  it("só aparece quando há versão nova para este aparelho", () => {
    expect(deveOferecer(oferta())).toBe(true);
  });

  it("cala a boca em todo o resto", () => {
    // Um app que funciona offline não pode abrir dizendo que falhou em
    // perguntar se existe versão nova.
    expect(deveOferecer(null)).toBe(false);
    expect(deveOferecer({ kind: "em_dia", versao: "0.5.0" })).toBe(false);
    expect(deveOferecer({ kind: "cedo", faltam_segundos: 3600 })).toBe(false);
    expect(deveOferecer({ kind: "dispensada", versao: "0.6.0" })).toBe(false);
    expect(deveOferecer({ kind: "indisponivel", motivo: "sem rede" })).toBe(false);
  });
});

describe("formatarTamanho", () => {
  it("usa a unidade que a pessoa lê em voz alta", () => {
    expect(formatarTamanho(87_920_201)).toBe("84 MB");
    expect(formatarTamanho(9_000_000)).toBe("8,6 MB");
    expect(formatarTamanho(120_000)).toBe("117 KB");
  });

  it("não inventa número para tamanho ausente ou inválido", () => {
    expect(formatarTamanho(0)).toBe("0 MB");
    expect(formatarTamanho(Number.NaN)).toBe("0 MB");
    expect(formatarTamanho(-5)).toBe("0 MB");
  });
});

describe("rotuloDoDownload", () => {
  it("põe o tamanho no botão, não num rodapé", () => {
    // Baixar dezenas de MB no dado móvel de alguém sem dizer quanto é abuso.
    expect(rotuloDoDownload(87_920_201)).toBe("Baixar e instalar (84 MB)");
  });
});

describe("passoAoAceitar", () => {
  it("explica a permissão antes de gastar dado", () => {
    expect(passoAoAceitar({ permitido: false, pedivel: true })).toBe("permissao");
  });

  it("vai direto ao download quando o aparelho já autorizou", () => {
    expect(passoAoAceitar({ permitido: true, pedivel: true })).toBe("baixando");
    // No desktop não há permissão a pedir.
    expect(passoAoAceitar({ permitido: true, pedivel: false })).toBe("baixando");
  });
});

describe("podeDispensar", () => {
  it("deixa adiar uma atualização comum", () => {
    expect(podeDispensar(oferta())).toBe(true);
  });

  it("não deixa adiar a obrigatória", () => {
    expect(podeDispensar(oferta({ obrigatoria: true }))).toBe(false);
  });
});

describe("percentual", () => {
  it("acompanha o download", () => {
    expect(percentual(0, 100)).toBe(0);
    expect(percentual(50, 100)).toBe(50);
    expect(percentual(100, 100)).toBe(100);
  });

  it("não passa de 100 nem quebra com total ausente", () => {
    // O total vem do manifesto; se ele mentir, a barra não pode estourar.
    expect(percentual(150, 100)).toBe(100);
    expect(percentual(10, 0)).toBe(0);
    expect(percentual(10, Number.NaN)).toBe(0);
  });
});

describe("mensagemDaChecagem", () => {
  it("nomeia a versão nova e diz o que fazer em seguida", () => {
    expect(
      mensagemDaChecagem({
        kind: "disponivel",
        versao: "0.5.3",
        notas: "",
        bytes: 1,
        obrigatoria: false,
        arquivo: "contr0l-0.5.3.apk",
      }),
    ).toBe("Versão 0.5.3 disponível. Feche esta janela para baixar.");
  });

  /**
   * O caso que motivou a função: sem texto, "você já está atualizado" e "o
   * botão não fez nada" são a mesma tela.
   */
  it("confirma que não há nada a fazer, com a versão instalada", () => {
    expect(mensagemDaChecagem({ kind: "em_dia", versao: "0.5.2" })).toBe(
      "Você já está na versão mais recente (0.5.2).",
    );
  });

  it("repassa o motivo de uma checagem que não completou", () => {
    expect(
      mensagemDaChecagem({
        kind: "indisponivel",
        motivo: "Sem conexao para verificar atualizacoes.",
      }),
    ).toBe("Sem conexao para verificar atualizacoes.");
  });

  it("responde alguma coisa para todo estado possível", () => {
    const estados: EstadoAtualizacao[] = [
      { kind: "em_dia", versao: "0.5.2" },
      { kind: "cedo", faltam_segundos: 3600 },
      { kind: "dispensada", versao: "0.5.3" },
      { kind: "indisponivel", motivo: "x" },
    ];
    for (const estado of estados) {
      expect(mensagemDaChecagem(estado).length).toBeGreaterThan(0);
    }
  });
});
