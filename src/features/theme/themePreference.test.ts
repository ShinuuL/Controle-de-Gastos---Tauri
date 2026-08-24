import { describe, expect, test } from "vitest";
import {
  THEME_STORAGE_KEY,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
} from "./themePreference";

describe("theme preference", () => {
  test("falls back to system for an invalid stored preference", () => {
    expect(readThemePreference({ getItem: () => "invalid" })).toBe("system");
  });

  test("reads a valid stored preference", () => {
    expect(readThemePreference({ getItem: () => "strawberry" })).toBe("strawberry");
  });

  test("persists the preference under the theme storage key", () => {
    let key = "";
    let value = "";

    writeThemePreference("dark", {
      setItem: (nextKey, nextValue) => {
        key = nextKey;
        value = nextValue;
      },
    });

    expect(key).toBe(THEME_STORAGE_KEY);
    expect(value).toBe("dark");
  });

  test("does not throw when storage is unavailable", () => {
    expect(readThemePreference({ getItem: () => { throw new Error("blocked"); } })).toBe("system");
    expect(() => writeThemePreference("light", { setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });

  test("resolves system preference from the operating system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("strawberry", false)).toBe("strawberry");
  });
});
