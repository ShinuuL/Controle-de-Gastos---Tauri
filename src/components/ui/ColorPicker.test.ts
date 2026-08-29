import { describe, expect, it } from "vitest";
import { normalizeHexInput } from "./ColorPicker";

describe("normalizeHexInput", () => {
  it("aceita seis dígitos com e sem cerquilha", () => {
    expect(normalizeHexInput("#ffffff")).toBe("#FFFFFF");
    expect(normalizeHexInput("ffffff")).toBe("#FFFFFF");
    expect(normalizeHexInput("  #38bdf8  ")).toBe("#38BDF8");
  });

  it("expande a forma de três dígitos", () => {
    expect(normalizeHexInput("#fff")).toBe("#FFFFFF");
    expect(normalizeHexInput("f0a")).toBe("#FF00AA");
  });

  it("devolve null enquanto o valor ainda não é uma cor", () => {
    // O campo não pode brigar com quem está no meio da digitação.
    expect(normalizeHexInput("#ff")).toBeNull();
    expect(normalizeHexInput("")).toBeNull();
    expect(normalizeHexInput("#gggggg")).toBeNull();
    expect(normalizeHexInput("vermelho")).toBeNull();
  });
});
