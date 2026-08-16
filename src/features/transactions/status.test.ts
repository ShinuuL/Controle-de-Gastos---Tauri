import { describe, expect, it } from "vitest";
import { getTransactionStatusPresentation } from "./status";

describe("getTransactionStatusPresentation", () => {
  it("returns a textual presentation for each status", () => {
    expect(getTransactionStatusPresentation("previsto").label).toBe("Prevista");
    expect(getTransactionStatusPresentation("previsto").className).toContain("border-warning");
    expect(getTransactionStatusPresentation("realizado").label).toBe("Realizada");
    expect(getTransactionStatusPresentation("realizado").className).toContain("bg-accent");
  });
});
