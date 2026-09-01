/**
 * Testes das paginas legais.
 *
 * Politica e termos sao pre-requisito da fase 15b (LGPD) e do primeiro cadastro
 * real. Um arquivo legal que existe mas nao esta linkado nao serve para nada, e
 * um link para arquivo que nao existe e pior que nenhum link -- as duas coisas
 * quebram em silencio, entao ficam travadas aqui.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const ler = (arquivo) => readFileSync(join(aqui, arquivo), "utf8");

const PAGINAS = ["privacidade.html", "termos.html"];

describe("paginas legais", () => {
  it("existem e trazem o estilo compartilhado", () => {
    expect(existsSync(join(aqui, "legal.css"))).toBe(true);
    for (const pagina of PAGINAS) {
      const html = ler(pagina);
      expect(html).toContain('<html lang="pt-BR">');
      expect(html).toContain('href="legal.css"');
      expect(html).toContain('href="index.html"');
    }
  });

  it("estao linkadas na pagina do app", () => {
    const index = ler("index.html");
    for (const pagina of PAGINAS) {
      expect(index).toContain(`href="${pagina}"`);
    }
  });

  it("apontam uma para a outra, para quem chegar por qualquer uma delas", () => {
    expect(ler("privacidade.html")).toContain('href="termos.html"');
    expect(ler("termos.html")).toContain('href="privacidade.html"');
  });

  it("dizem que a senha perdida nao tem recuperacao", () => {
    // E a unica troca ruim do produto que nao pode ser descoberta depois: sem
    // isto escrito, o usuario cadastra sem saber o que assumiu.
    for (const pagina of PAGINAS) {
      expect(ler(pagina)).toMatch(/n[ãa]o pode ser recuperado/i);
    }
  });

  it("a politica declara base legal, transferencia internacional e o caminho da exclusao", () => {
    const politica = ler("privacidade.html");
    expect(politica).toMatch(/art\. 7º, V/);
    expect(politica).toMatch(/art\. 33/);
    expect(politica).toMatch(/art\. 18/);
    expect(politica).toMatch(/Apagar\s+minha conta/);
    expect(politica).toMatch(/Cloudflare/);
  });
});
