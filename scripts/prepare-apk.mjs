/**
 * Copia o APK gerado pelo Gradle para um nome de distribuicao.
 *
 * O Gradle nomeia a saida a partir do modulo ("app") e da variante, entao o
 * arquivo sai como `app-universal-release.apk`. Esse e o nome que o usuario
 * veria na pagina de download e na pasta de Downloads do celular -- e nele nao
 * ha nenhuma pista de que o app se chama Contr0l.
 *
 * O `publish` do deploy-base versiona o arquivo a partir do nome do arquivo
 * apontado no deploy.toml (`stem-versao.ext`), entao apontar para
 * `dist-android/contr0l.apk` produz `contr0l-0.2.9.apk`.
 *
 * Copiar em vez de configurar `archivesName` no build.gradle.kts porque aquele
 * arquivo e gerado pelo Tauri: uma regeneracao do projeto Android descartaria a
 * configuracao sem aviso. E `archivesName` daria `contr0l-universal-release`,
 * que ainda carrega o ruido da variante.
 */

import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ORIGEM = resolve(
  raiz,
  "src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk",
);
const DESTINO = resolve(raiz, "dist-android/contr0l.apk");

try {
  statSync(ORIGEM);
} catch {
  console.error(`APK nao encontrado em:\n  ${ORIGEM}\n`);
  console.error("Rode `npx tauri android build --apk` antes.");
  process.exit(1);
}

mkdirSync(dirname(DESTINO), { recursive: true });
copyFileSync(ORIGEM, DESTINO);

const { size } = statSync(DESTINO);
console.log(`APK pronto para distribuicao:\n  ${DESTINO}\n  ${size.toLocaleString("pt-BR")} bytes`);
