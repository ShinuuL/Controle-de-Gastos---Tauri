import { describe, expect, it } from "vitest";
import {
  SENHA_MINIMA,
  camposVazios,
  normalizarEmail,
  validarConta,
  type CamposConta,
} from "./accountForm";

function campos(over: Partial<CamposConta> = {}): CamposConta {
  return {
    email: "pessoa@exemplo.com.br",
    senha: "uma senha longa",
    confirmacao: "uma senha longa",
    cienteDaPerda: true,
    ...over,
  };
}

describe("validarConta", () => {
  it("aceita um cadastro completo", () => {
    expect(validarConta("criar", campos())).toBeNull();
  });

  it("aceita login sem confirmacao nem ciencia", () => {
    expect(
      validarConta("entrar", campos({ confirmacao: "", cienteDaPerda: false })),
    ).toBeNull();
  });

  it("exige e-mail", () => {
    expect(validarConta("entrar", campos({ email: "   " }))).toBe("Informe o e-mail.");
  });

  it("recusa e-mail malformado", () => {
    expect(validarConta("entrar", campos({ email: "pessoa@exemplo" }))).toBe("E-mail invalido.");
  });

  it("exige senha", () => {
    expect(validarConta("entrar", campos({ senha: "" }))).toBe("Informe a senha.");
  });

  it("exige senha longa no cadastro", () => {
    const erro = validarConta("criar", campos({ senha: "curta", confirmacao: "curta" }));
    expect(erro).toContain(String(SENHA_MINIMA));
  });

  it("nao valida forca no login", () => {
    // Quem criou a conta com a regra antiga precisa continuar entrando.
    expect(validarConta("entrar", campos({ senha: "abc" }))).toBeNull();
  });

  it("exige confirmacao igual", () => {
    expect(validarConta("criar", campos({ confirmacao: "outra coisa" }))).toBe(
      "As senhas nao conferem.",
    );
  });

  it("exige a ciencia de que perder a senha perde o backup", () => {
    // Nao e burocracia: com E2E nao existe "recuperar conta", e isso precisa
    // ser dito na cara do usuario no cadastro, nao nos termos.
    const erro = validarConta("criar", campos({ cienteDaPerda: false }));
    expect(erro).toContain("backup");
  });

  it("reclama de uma coisa por vez, na ordem em que o formulario aparece", () => {
    const tudoErrado = campos({ email: "", senha: "", confirmacao: "x", cienteDaPerda: false });
    expect(validarConta("criar", tudoErrado)).toBe("Informe o e-mail.");
  });
});

describe("normalizarEmail", () => {
  it("tira espaco e caixa, como o servidor faz", () => {
    expect(normalizarEmail("  Pessoa@Exemplo.COM.br ")).toBe("pessoa@exemplo.com.br");
  });
});

describe("camposVazios", () => {
  it("comeca sem a ciencia marcada", () => {
    expect(camposVazios().cienteDaPerda).toBe(false);
  });
});
