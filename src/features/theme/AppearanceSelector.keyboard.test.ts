import { describe, expect, test } from "vitest";
import { getNextMenuItemIndex } from "./AppearanceSelector";

describe("getNextMenuItemIndex", () => {
  test("calcula o próximo item para as teclas de navegação do menu", () => {
    expect(getNextMenuItemIndex(0, "ArrowDown", 4)).toBe(1);
    expect(getNextMenuItemIndex(3, "ArrowDown", 4)).toBe(0);
    expect(getNextMenuItemIndex(0, "ArrowUp", 4)).toBe(3);
    expect(getNextMenuItemIndex(2, "Home", 4)).toBe(0);
    expect(getNextMenuItemIndex(1, "End", 4)).toBe(3);
    expect(getNextMenuItemIndex(1, "Enter", 4)).toBeNull();
  });
});
