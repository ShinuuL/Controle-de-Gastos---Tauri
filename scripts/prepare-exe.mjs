/**
 * Copia o instalador do Windows gerado pelo Tauri para um nome de distribuicao.
 *
 * Mesma razao do `prepare-apk.mjs`: o `publish` do deploy-base versiona a
 * partir do nome do arquivo apontado no `deploy.toml` (`stem-versao.ext`), e o
 * bundler do Tauri ja produz um nome com versao e arquitetura dentro
 * (`Contr0l_0.4.1_x64-setup.exe`). Deixar assim geraria
 * `Contr0l_0.4.1_x64-setup-0.4.1.exe`, com a versao duas vezes.
 *
 * O arquivo e procurado em vez de montado a partir da versao: o padrao de nome
 * do NSIS ja mudou entre versoes do Tauri, e um caminho fixo quebraria em
 * silencio na proxima atualizacao -- exatamente na hora de publicar.
 */

import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = resolve(raiz, "src-tauri/target/release/bundle");
const DESTINO = resolve(raiz, "dist-windows/contr0l.exe");

/**
 * O instalador a publicar.
 *
 * A preferencia e do NSIS, **por formato e nao por data**: o `tauri build` gera
 * MSI e NSIS na mesma rodada, entao escolher "o mais recente" faria a decisao
 * depender da ordem interna do bundler. Se ela mudasse, um `.msi` seria copiado
 * com nome `.exe`, e o erro so apareceria na maquina de quem baixou.
 *
 * Dentro de uma pasta, ai sim vale o mais recente: sao rodadas diferentes do
 * mesmo formato.
 */
function instalador() {
  for (const [pasta, extensao] of [
    ["nsis", ".exe"],
    ["msi", ".msi"],
  ]) {
    let entradas;
    try {
      entradas = readdirSync(join(BUNDLE, pasta));
    } catch {
      continue; // formato nao gerado nesta maquina
    }
    const achados = entradas
      .filter((nome) => nome.toLowerCase().endsWith(extensao))
      .map((nome) => join(BUNDLE, pasta, nome))
      .map((caminho) => ({ caminho, extensao, mtime: statSync(caminho).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (achados.length) return achados[0];
  }
  return null;
}

const escolhido = instalador();

if (!escolhido) {
  console.error("Nenhum instalador encontrado em:");
  console.error(`  ${join(BUNDLE, "nsis")}`);
  console.error(`  ${join(BUNDLE, "msi")}\n`);
  console.error("Rode `npx tauri build` no Windows antes.");
  process.exit(1);
}

// O deploy.toml aponta para um .exe. Copiar um MSI com esse nome produziria um
// arquivo que o Windows recusa a abrir, e o erro so apareceria depois de
// publicado -- na maquina de quem baixou.
if (!DESTINO.toLowerCase().endsWith(escolhido.extensao)) {
  console.error(`So encontrei um instalador ${escolhido.extensao}:`);
  console.error(`  ${escolhido.caminho}\n`);
  console.error(`O destino e ${DESTINO}, e as extensoes precisam bater.`);
  console.error("Ajuste o [[artifact]] do deploy.toml (path e kind) para o formato gerado.");
  process.exit(1);
}

mkdirSync(dirname(DESTINO), { recursive: true });
copyFileSync(escolhido.caminho, DESTINO);

const { size } = statSync(DESTINO);
console.log("Instalador pronto para distribuicao:");
console.log(`  origem:  ${escolhido.caminho}`);
console.log(`  destino: ${DESTINO}`);
console.log(`  ${size.toLocaleString("pt-BR")} bytes`);
