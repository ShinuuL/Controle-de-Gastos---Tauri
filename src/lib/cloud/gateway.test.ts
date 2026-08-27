import { describe, expect, it } from "vitest";
import { NotConfiguredError, endpoint, isConfigured } from "./gateway";

describe("gateway", () => {
  it("comeca desconfigurado sem VITE_API_BASE_URL", () => {
    expect(isConfigured()).toBe(false);
  });

  it("falha de forma explicita ao montar endpoint sem configuracao", () => {
    expect(() => endpoint("/v1/session")).toThrow(NotConfiguredError);
  });
});
