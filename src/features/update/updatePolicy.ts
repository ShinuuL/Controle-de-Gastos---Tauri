/**
 * Regras da atualização, fora do componente.
 *
 * O que decide se uma faixa aparece na frente do usuário e o que ela diz é
 * regra de produto, não layout — e regra sem teste vira suposição.
 */

import type { EstadoAtualizacao, PermissaoInstalacao } from "./updateClient";

/** Passo em que o fluxo está. A tela desenha um por vez. */
export type PassoAtualizacao =
  | "oculto"
  | "oferta"
  | "permissao"
  | "baixando"
  | "pronto"
  | "erro";

/**
 * A faixa só aparece quando há uma versão nova de verdade para este aparelho.
 *
 * `cedo`, `em_dia`, `dispensada` e `indisponivel` são silêncio: um app que
 * funciona offline não pode abrir dizendo que falhou em perguntar se existe
 * versão nova.
 */
export function deveOferecer(estado: EstadoAtualizacao | null): boolean {
  return estado?.kind === "disponivel";
}

/**
 * Tamanho como se diz em voz alta. Sem casa decimal abaixo de 10 MB seria
 * "0 MB" para arquivo pequeno, e com duas casas viraria ruído em 88 MB.
 */
export function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb < 10) return `${mb.toFixed(1).replace(".", ",")} MB`;
  return `${Math.round(mb)} MB`;
}

/**
 * O aviso de dados móveis vai no texto do botão, e não num rodapé.
 *
 * São dezenas de MB: baixar isso no dado móvel de alguém sem dizer o tamanho é
 * abuso, e um número que ninguém lê não avisa ninguém.
 */
export function rotuloDoDownload(bytes: number): string {
  return `Baixar e instalar (${formatarTamanho(bytes)})`;
}

/**
 * Próximo passo depois de o usuário aceitar a atualização.
 *
 * A permissão de "instalar apps desconhecidos" é uma tela do sistema, e cair
 * nela sem explicação assusta mais do que informa: quando ela falta, o fluxo
 * para para explicar antes de baixar qualquer byte.
 */
export function passoAoAceitar(permissao: PermissaoInstalacao): PassoAtualizacao {
  return permissao.permitido ? "baixando" : "permissao";
}

/**
 * A dispensa é do usuário e vale só para aquela versão -- exceto quando a
 * atualização é obrigatória, e aí não há o que dispensar.
 */
export function podeDispensar(estado: EstadoAtualizacao | null): boolean {
  return estado?.kind === "disponivel" && !estado.obrigatoria;
}

/** Percentual inteiro, limitado a 100 mesmo se o servidor mentir no tamanho. */
export function percentual(baixados: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((baixados / total) * 100)));
}
