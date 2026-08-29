import { beforeEach, describe, expect, it } from "vitest";
import {
  pushBackGuard,
  resetBackGuards,
  type BackGuardHost,
} from "./backGuard";

function createHost() {
  const stack: unknown[] = [];
  const listeners = new Set<() => void>();
  const host: BackGuardHost = {
    history: {
      get state() {
        return stack[stack.length - 1] ?? null;
      },
      pushState(state: unknown) {
        stack.push(state);
      },
      back() {
        stack.pop();
        for (const listener of listeners) listener();
      },
    } as BackGuardHost["history"],
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
  };
  return { host, stack, listeners };
}

describe("pushBackGuard", () => {
  beforeEach(() => resetBackGuards());

  it("chama o callback quando o voltar do sistema desempilha a entrada", () => {
    const { host, stack } = createHost();
    let closed = 0;

    pushBackGuard(host, () => {
      closed += 1;
    });
    expect(stack).toHaveLength(1);

    host.history.back();

    expect(closed).toBe(1);
    expect(stack).toHaveLength(0);
  });

  it("remove a entrada empilhada quando a camada fecha por outro caminho", () => {
    const { host, stack, listeners } = createHost();
    let closed = 0;

    const dispose = pushBackGuard(host, () => {
      closed += 1;
    });
    dispose();

    expect(stack).toHaveLength(0);
    expect(closed).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it("desempilha as camadas na ordem inversa da abertura", () => {
    const { host, stack } = createHost();
    const closed: string[] = [];

    pushBackGuard(host, () => closed.push("aba"));
    pushBackGuard(host, () => closed.push("modal"));
    expect(stack).toHaveLength(2);

    host.history.back();
    expect(closed).toEqual(["modal"]);

    host.history.back();
    expect(closed).toEqual(["modal", "aba"]);
    expect(stack).toHaveLength(0);
  });

  it("sobrevive ao monta-desmonta-remonta do StrictMode sem fechar a camada", () => {
    // Sequência exata do React em desenvolvimento: o popstate do back() da
    // limpeza chega depois do remonte e não pode ser lido como voltar do usuário.
    const { host, stack } = createHost();
    let closed = 0;
    const onBack = () => {
      closed += 1;
    };

    const first = pushBackGuard(host, onBack);
    first();
    const second = pushBackGuard(host, onBack);

    expect(closed).toBe(0);
    expect(stack).toHaveLength(1);

    // Agora o voltar de verdade fecha a camada.
    host.history.back();
    expect(closed).toBe(1);

    second();
  });
});
