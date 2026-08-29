import { describe, expect, it } from "vitest";
import { hueFromPoint, pointFromHue, svFromPoint } from "./ColorWheel";

const center = { x: 100, y: 100 };

describe("anel de matiz", () => {
  it("põe 0° no topo e cresce no sentido horário", () => {
    expect(Math.round(hueFromPoint({ x: 100, y: 0 }, center))).toBe(0);
    expect(Math.round(hueFromPoint({ x: 200, y: 100 }, center))).toBe(90);
    expect(Math.round(hueFromPoint({ x: 100, y: 200 }, center))).toBe(180);
    expect(Math.round(hueFromPoint({ x: 0, y: 100 }, center))).toBe(270);
  });

  it("volta do ângulo para a posição do marcador", () => {
    expect(pointFromHue(0)).toEqual({ x: 0.5, y: 0 });
    const direita = pointFromHue(90);
    expect(direita.x).toBeCloseTo(1);
    expect(direita.y).toBeCloseTo(0.5);
  });
});

describe("quadrado de saturação e brilho", () => {
  const size = { width: 100, height: 100 };

  it("mapeia os cantos: branco na esquerda em cima, preto embaixo", () => {
    expect(svFromPoint({ x: 0, y: 0 }, size)).toEqual({ s: 0, v: 100 });
    expect(svFromPoint({ x: 100, y: 0 }, size)).toEqual({ s: 100, v: 100 });
    expect(svFromPoint({ x: 0, y: 100 }, size)).toEqual({ s: 0, v: 0 });
  });

  it("prende o arrasto que sai da caixa nas bordas", () => {
    // Sem isso o arrasto que passa da borda devolveria saturação acima de 100%
    // e a cor daria a volta.
    expect(svFromPoint({ x: -40, y: -40 }, size)).toEqual({ s: 0, v: 100 });
    expect(svFromPoint({ x: 180, y: 180 }, size)).toEqual({ s: 100, v: 0 });
  });
});
