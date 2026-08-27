/**
 * Canal de distribuicao do build. Define se o app exige login/entitlement.
 *
 * Dois APKs sao gerados a partir do mesmo codigo:
 *   VITE_DISTRIBUTION=gated  -> APK publicado no site, exige login + pagamento
 *   VITE_DISTRIBUTION=direct -> APK distribuido por fora, 100% local, sem login
 *
 * O padrao e "direct": um build sem a variavel definida se comporta como o app
 * atual, sem nenhuma chamada de rede.
 */

export type DistributionChannel = "gated" | "direct";

export function parseDistributionChannel(raw: unknown): DistributionChannel {
  return raw === "gated" ? "gated" : "direct";
}

export const DISTRIBUTION_CHANNEL: DistributionChannel = parseDistributionChannel(
  import.meta.env.VITE_DISTRIBUTION,
);

/** Build exige sessao autenticada antes de liberar as telas. */
export function requiresAuth(
  channel: DistributionChannel = DISTRIBUTION_CHANNEL,
): boolean {
  return channel === "gated";
}
