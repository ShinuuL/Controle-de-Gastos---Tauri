import { describe, expect, it } from "vitest";
import {
  hexToHsl,
  hexToHsv,
  hsvToHex,
  hslToHex,
  isHexColor,
  strawberryBerryColors,
} from "./categoryColor";

describe("conversão de cor", () => {
  it("faz a volta hex → hsl → hex sem perder a cor", () => {
    for (const hex of ["#f59e0b", "#38bdf8", "#8b5cf6", "#000000", "#ffffff"]) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex);
    }
  });

  it("reconhece só hexadecimal de seis dígitos", () => {
    expect(isHexColor("#F59E0B")).toBe(true);
    expect(isHexColor("#f59")).toBe(false);
    expect(isHexColor("rgb(1,2,3)")).toBe(false);
  });
});

describe("conversão HSV", () => {
  it("faz a volta hex → hsv → hex sem perder a cor", () => {
    for (const hex of ["#F59E0B", "#38BDF8", "#8B5CF6", "#000000", "#FFFFFF"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("põe branco e preto em cantos diferentes do quadrado", () => {
    expect(hexToHsv("#FFFFFF")).toEqual({ h: 0, s: 0, v: 100 });
    expect(hexToHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
  });

  it("lê a matiz de cada primária", () => {
    expect(Math.round(hexToHsv("#FF0000").h)).toBe(0);
    expect(Math.round(hexToHsv("#00FF00").h)).toBe(120);
    expect(Math.round(hexToHsv("#0000FF").h)).toBe(240);
  });
});

describe("cores do morango", () => {
  it("mantém intacta uma cor que já está na faixa legível", () => {
    expect(strawberryBerryColors("#ff9815").fill).toBe("#ff9815");
  });

  it("escurece o branco para o morango não sumir na superfície clara", () => {
    const { fill } = strawberryBerryColors("#ffffff");

    expect(fill).not.toBe("#ffffff");
    // A folga de 1 é o arredondamento para 8 bits por canal na volta a hex.
    expect(hexToHsl(fill).l).toBeLessThanOrEqual(71);
  });

  it("clareia o preto para o morango não sumir dentro do próprio contorno", () => {
    const { fill, stroke } = strawberryBerryColors("#000000");

    expect(hexToHsl(fill).l).toBeGreaterThanOrEqual(38);
    expect(hexToHsl(stroke).l).toBeLessThan(hexToHsl(fill).l);
  });

  it("preserva a matiz escolhida e deriva o contorno dela", () => {
    const { fill, stroke } = strawberryBerryColors("#38bdf8");

    expect(Math.round(hexToHsl(fill).h)).toBe(Math.round(hexToHsl("#38bdf8").h));
    expect(Math.round(hexToHsl(stroke).h)).toBe(Math.round(hexToHsl("#38bdf8").h));
    expect(hexToHsl(stroke).l).toBeLessThan(hexToHsl(fill).l);
  });
});
