/**
 * PLACEHOLDER -- cliente HTTP do backend (auth, entitlement, sync).
 *
 * Nada aqui faz chamada real ainda. Cada funcao lanca NotConfiguredError
 * enquanto VITE_API_BASE_URL nao estiver definida, para que um build
 * mal configurado falhe de forma explicita em vez de silenciosa.
 *
 * Antes de ligar de verdade e preciso:
 *   1. liberar o dominio em connect-src na CSP (src-tauri/tauri.conf.json);
 *   2. decidir entre fetch da webview e um comando Rust tipado
 *      (AGENTS.md: a nuvem deve usar comandos Rust como autoridade do banco).
 */

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

export class NotConfiguredError extends Error {
  constructor(operacao: string) {
    super(
      `${operacao}: backend nao configurado. Defina VITE_API_BASE_URL e libere o dominio na CSP.`,
    );
    this.name = "NotConfiguredError";
  }
}

export function isConfigured(): boolean {
  return API_BASE_URL.length > 0;
}

/** Monta a URL de um endpoint do gateway. */
export function endpoint(path: string): string {
  if (!isConfigured()) throw new NotConfiguredError("endpoint");
  return `${API_BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
