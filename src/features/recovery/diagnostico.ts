/**
 * Leitura do diagnóstico do banco (`diagnose_database`, em `recovery.rs`).
 *
 * Existe por causa do incidente de 2026-09-01. A tela decidia se havia reparo a
 * oferecer olhando **a mensagem de erro** da abertura: se ela contivesse a frase
 * do sqlx sobre migração modificada, o botão aparecia. Só que o erro que chega à
 * tela nem sempre é o de primeira ordem -- naquele dia era `no such table:
 * app_meta`, consequência de uma migração que nunca rodou --, e a frase não
 * batia. Resultado: aparelho com um problema perfeitamente reparável recebendo
 * "a causa não é uma que o reparo automático saiba tratar", sem saída.
 *
 * Mensagem de erro é heurística. O `diagnosticar` do Rust olha o schema e o
 * histórico de verdade, e é ele quem deve responder. A classificação da
 * mensagem vira só o plano B, para quando o próprio diagnóstico não roda.
 */

import type { DbFailure } from "../../lib/dbFailure";
import { isRepairable } from "../../lib/dbFailure";

/** Espelha `DatabaseState` de `recovery.rs` (serde kebab-case). */
export type EstadoDoBanco = "sem-historico" | "ok" | "reparavel" | "incerto";

/** Espelha `Diagnosis` de `recovery.rs`. */
export interface Diagnostico {
  state: EstadoDoBanco;
  divergentes: number[];
  ausentes: number[];
  sem_efeito: number[];
  colunas_de_transacao_presentes: boolean;
}

/**
 * O botão de reparo deve aparecer?
 *
 * O diagnóstico manda quando existe. Sem ele, cai na classificação da mensagem.
 * Oferecer a mais é seguro: `repair_database` recusa qualquer estado que não
 * seja `reparavel`, então o Rust continua sendo a autoridade final.
 */
export function deveOferecerReparo(
  falha: DbFailure,
  diagnostico: Diagnostico | null,
): boolean {
  if (diagnostico) return diagnostico.state === "reparavel";
  return isRepairable(falha);
}

/** Uma frase sobre o estado, em português, para quem está olhando a tela. */
export function explicacaoDoEstado(estado: EstadoDoBanco): string {
  switch (estado) {
    case "reparavel":
      return "O histórico pode ser acertado sem tocar nos seus lançamentos.";
    case "incerto":
      return "Há divergência no histórico que o banco não confirma. Reparar às cegas poderia registrar como feita uma atualização que nunca rodou.";
    case "ok":
      return "O histórico de atualizações está íntegro — a falha ao abrir veio de outro lugar.";
    case "sem-historico":
      return "O banco ainda não tem histórico de atualizações.";
  }
}

/**
 * As linhas do diagnóstico, só as que têm conteúdo.
 *
 * Cada uma nomeia as versões envolvidas: sem o número, "há divergência" não
 * ajuda ninguém a procurar nada.
 */
export function linhasDoDiagnostico(diagnostico: Diagnostico): string[] {
  const linhas: string[] = [];
  if (diagnostico.divergentes.length > 0) {
    linhas.push(
      `Atualizações cujo registro não confere com esta versão do app: ${listar(diagnostico.divergentes)}.`,
    );
  }
  if (diagnostico.ausentes.length > 0) {
    linhas.push(
      `Já aplicadas no banco, mas fora do histórico: ${listar(diagnostico.ausentes)}.`,
    );
  }
  if (diagnostico.sem_efeito.length > 0) {
    linhas.push(
      `Registradas como aplicadas sem estarem no banco: ${listar(diagnostico.sem_efeito)}.`,
    );
  }
  return linhas;
}

function listar(versoes: number[]): string {
  return versoes.map((v) => `v${v}`).join(", ");
}
