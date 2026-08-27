import { describe, expect, it } from "vitest";
import { parseDistributionChannel, requiresAuth } from "./distribution";

describe("parseDistributionChannel", () => {
  it("reconhece o canal gated", () => {
    expect(parseDistributionChannel("gated")).toBe("gated");
  });

  it("trata ausencia e valores desconhecidos como direct", () => {
    expect(parseDistributionChannel(undefined)).toBe("direct");
    expect(parseDistributionChannel("")).toBe("direct");
    expect(parseDistributionChannel("qualquer-coisa")).toBe("direct");
  });
});

describe("requiresAuth", () => {
  it("exige login apenas no canal gated", () => {
    expect(requiresAuth("gated")).toBe(true);
    expect(requiresAuth("direct")).toBe(false);
  });
});
