import { useEffect, useRef } from "react";

/**
 * Ancora uma camada dispensável (aba fora do resumo, modal, confirmação) numa
 * entrada do histórico, para que o botão voltar do Android a feche em vez de
 * fechar o app.
 *
 * No Android o botão voltar chega à webview como navegação de histórico. Sem
 * nenhuma entrada empilhada, a webview não tem para onde voltar e o sistema
 * encerra a activity -- que é exatamente o que acontecia: abrir um modal e tocar
 * em voltar matava o app com o formulário preenchido dentro.
 *
 * Estar no resumo sem nada aberto continua sem entrada nenhuma: aí voltar fecha
 * o app mesmo, que é o comportamento esperado no Android.
 */
export interface BackGuardHost {
  history: Pick<History, "pushState" | "back" | "state">;
  addEventListener: (type: "popstate", listener: () => void) => void;
  removeEventListener: (type: "popstate", listener: () => void) => void;
}

interface ActiveGuard {
  token: number;
  onBack: () => void;
}

/**
 * Pilha própria das camadas abertas.
 *
 * Não dá para cada camada registrar seu próprio listener de `popstate`: o
 * evento é disparado para todos os listeners registrados, então um único toque
 * em voltar fecharia o modal e a aba de uma vez. Com a pilha, só a camada do
 * topo responde -- e um listener só fica registrado enquanto houver camada.
 */
const guards: ActiveGuard[] = [];
let guardCounter = 0;
let boundHost: BackGuardHost | null = null;

/**
 * Quantos `popstate` ainda vão chegar por causa de um `history.back()` que o
 * próprio guard disparou ao se desfazer.
 *
 * `history.back()` é assíncrono: o evento chega depois, e sem essa contagem ele
 * é lido como se o usuário tivesse tocado em voltar. Em desenvolvimento, com o
 * StrictMode montando, desmontando e remontando cada efeito, era o suficiente
 * para o modal de importação abrir e fechar sozinho no mesmo instante.
 */
let pendingSelfPops = 0;

function handlePopState(): void {
  if (pendingSelfPops > 0) {
    pendingSelfPops -= 1;
    maybeUnbind();
    return;
  }
  const guard = guards.pop();
  maybeUnbind();
  guard?.onBack();
}

/**
 * O listener só sai quando não há mais camada nem `popstate` próprio a
 * consumir. Soltá-lo antes deixaria o evento do `history.back()` da limpeza sem
 * quem o descartasse, e ele seria contado contra a camada seguinte.
 */
function maybeUnbind(): void {
  if (guards.length === 0 && pendingSelfPops === 0) unbind();
}

function bind(host: BackGuardHost): void {
  if (boundHost) return;
  boundHost = host;
  host.addEventListener("popstate", handlePopState);
}

function unbind(): void {
  boundHost?.removeEventListener("popstate", handlePopState);
  boundHost = null;
}

/** Núcleo testável do hook: empilha a entrada e devolve como desfazer. */
export function pushBackGuard(
  host: BackGuardHost,
  onBack: () => void,
): () => void {
  guardCounter += 1;
  const token = guardCounter;
  bind(host);
  guards.push({ token, onBack });
  host.history.pushState({ backGuard: token }, "");

  return () => {
    const index = guards.findIndex((guard) => guard.token === token);
    if (index === -1) return; // já consumido pelo botão voltar
    guards.splice(index, 1);
    // Fechou por outro caminho (botão X, Esc, salvar): a entrada empilhada
    // ainda está lá e precisa sair, senão o próximo toque em voltar não faz
    // nada visível.
    if (host.history.state?.backGuard === token) {
      pendingSelfPops += 1;
      host.history.back();
    }
    maybeUnbind();
  };
}

/** Só para os testes: a pilha é de módulo e sobrevive entre casos. */
export function resetBackGuards(): void {
  guards.length = 0;
  pendingSelfPops = 0;
  unbind();
}

export function useBackGuard(active: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    return pushBackGuard(window, () => onBackRef.current());
  }, [active]);
}
