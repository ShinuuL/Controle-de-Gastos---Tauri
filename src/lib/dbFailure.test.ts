import { describe, expect, it } from "vitest";
import { classifyDbFailure, isRepairable } from "./dbFailure";

describe("classifyDbFailure", () => {
  it("reconhece a migracao modificada, que e o caso da populacao quebrada", () => {
    const f = classifyDbFailure(
      "error returned from database: migration 1 was previously applied but has been modified",
    );
    expect(f.kind).toBe("migracao-divergente");
    expect(f.version).toBe(1);
    expect(isRepairable(f)).toBe(true);
  });

  it("reconhece migracao aplicada que sumiu do codigo", () => {
    const f = classifyDbFailure(
      "migration 5 was previously applied but is missing in the resolved migrations",
    );
    expect(f.kind).toBe("migracao-ausente-no-codigo");
    expect(f.version).toBe(5);
    expect(isRepairable(f)).toBe(false);
  });

  it("nao tenta reparar falha desconhecida", () => {
    const f = classifyDbFailure(new Error("disk I/O error"));
    expect(f.kind).toBe("desconhecida");
    expect(f.version).toBeNull();
    expect(isRepairable(f)).toBe(false);
  });

  it("aceita Error, string e valor solto sem quebrar", () => {
    expect(classifyDbFailure(new Error("x")).raw).toBe("x");
    expect(classifyDbFailure("y").raw).toBe("y");
    expect(classifyDbFailure(42).raw).toBe("42");
  });

  it("preserva a mensagem original para suporte", () => {
    const original = "migration 1 was previously applied but has been modified";
    expect(classifyDbFailure(original).raw).toBe(original);
  });
});
