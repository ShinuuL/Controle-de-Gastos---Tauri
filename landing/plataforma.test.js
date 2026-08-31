/**
 * Testes da escolha de download da landing page.
 *
 * O JS da pagina e inline (a CSP e restritiva e a pagina precisa funcionar como
 * arquivo unico), entao o teste recorta as funcoes puras do HTML e as avalia
 * isoladas. E feio, e ainda assim vale: esta e a regra que decide o que o
 * visitante ve, e errar aqui significa oferecer um APK para quem esta no PC.
 *
 * Se o recorte quebrar, o teste falha ruidosamente em vez de passar vazio.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(aqui, "index.html"), "utf8");

const INICIO = "/** Plataforma de quem esta lendo a pagina. */";
const FIM = "const MOTIVOS = {";

const i = html.indexOf(INICIO);
const f = html.indexOf(FIM);
if (i === -1 || f === -1 || f < i) {
  throw new Error("nao encontrei o bloco de escolha de plataforma no index.html");
}

/** Avalia o recorte com um `navigator` de mentira e devolve `escolher`. */
function comNavegador(userAgent) {
  const fonte = html.slice(i, f) + "\nreturn { escolher, plataformaDoNavegador };";
  // eslint-disable-next-line no-new-func
  return new Function("navigator", fonte)({ userAgent });
}

const UA = {
  android: "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
};

const APK = { platform: "android", url: "https://gw/contr0l.apk", size: 100, filename: "contr0l.apk" };
const EXE = { platform: "windows", url: "https://gw/contr0l.exe", size: 200, filename: "contr0l.exe" };

describe("plataformaDoNavegador", () => {
  it.each([
    ["android", UA.android],
    ["windows", UA.windows],
    ["ios", UA.iphone],
    ["outra", UA.linux],
  ])("reconhece %s", (esperada, ua) => {
    expect(comNavegador(ua).plataformaDoNavegador()).toBe(esperada);
  });

  it("Android vence Linux no mesmo user agent", () => {
    // O UA do Android tambem contem "Linux": a ordem dos testes importa, e
    // inverter faria todo celular cair no caso generico.
    expect(comNavegador(UA.android).plataformaDoNavegador()).toBe("android");
  });
});

describe("escolher, com as duas plataformas publicadas", () => {
  const artefatos = { android: APK, windows: EXE };

  it("no Android oferece o APK primeiro", () => {
    const { escolher } = comNavegador(UA.android);
    const r = escolher(artefatos);
    expect(r.principal.plataforma).toBe("android");
    expect(r.alternativo.plataforma).toBe("windows");
    expect(r.nota).toBeUndefined();
  });

  it("no Windows oferece o instalador primeiro, com o APK ao lado", () => {
    // Quem le no computador pode querer mandar o APK para o proprio celular.
    const { escolher } = comNavegador(UA.windows);
    const r = escolher(artefatos);
    expect(r.principal.plataforma).toBe("windows");
    expect(r.principal.rotulo).toBe("Baixar para Windows");
    expect(r.alternativo.plataforma).toBe("android");
  });

  it("em plataforma desconhecida nao esconde nenhuma opcao", () => {
    const r = comNavegador(UA.linux).escolher(artefatos);
    expect(r.principal).toBeTruthy();
    expect(r.alternativo).toBeTruthy();
  });

  it("no iPhone explica que nao ha versao, em vez de oferecer em silencio", () => {
    const r = comNavegador(UA.iphone).escolher(artefatos);
    expect(r.nota).toContain("iPhone");
  });
});

describe("escolher, enquanto o .exe nao existe", () => {
  const soAndroid = { android: APK, windows: undefined };

  it("no Windows avisa que o arquivo e o APK, e nao mostra botao vazio", () => {
    // O caso que vale hoje: um botao "Baixar para Windows" que nao baixa nada
    // seria pior que botao nenhum.
    const r = comNavegador(UA.windows).escolher(soAndroid);
    expect(r.principal.plataforma).toBe("android");
    expect(r.alternativo).toBeNull();
    expect(r.nota).toContain("Windows");
  });

  it("no Android segue normal, sem alternativo", () => {
    const r = comNavegador(UA.android).escolher(soAndroid);
    expect(r.principal.plataforma).toBe("android");
    expect(r.alternativo).toBeFalsy();
  });
});

describe("escolher, sem nenhum artefato", () => {
  it("nao inventa download", () => {
    // Manifesto vazio ou de outro app: a pagina precisa cair no estado
    // "indisponivel", nao apontar para lugar nenhum.
    for (const ua of Object.values(UA)) {
      const r = comNavegador(ua).escolher({ android: undefined, windows: undefined });
      expect(r.principal).toBeFalsy();
    }
  });
});

describe("rotulos", () => {
  it("cada plataforma tem rotulo, requisito e nome de arquivo", () => {
    const r = comNavegador(UA.windows).escolher({ android: APK, windows: EXE });
    expect(r.principal.requer).toMatch(/Windows/);
    expect(r.principal.arquivoRotulo).toBe("instalador");
    expect(r.alternativo.requer).toMatch(/Android/);
    expect(r.alternativo.arquivoRotulo).toBe("APK");
  });
});
