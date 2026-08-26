export const THEME_STORAGE_KEY = "controle-gastos.theme-preference";

const THEME_PREFERENCES = ["light", "dark", "strawberry"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = ThemePreference;

type ThemeStorageReader = Pick<Storage, "getItem">;
type ThemeStorageWriter = Pick<Storage, "setItem">;

function isThemePreference(value: string | null): value is ThemePreference {
  return value !== null && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function readThemePreference(storage: ThemeStorageReader): ThemePreference {
  try {
    const storedPreference = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(storedPreference) ? storedPreference : "light";
  } catch {
    return "light";
  }
}

export function writeThemePreference(
  preference: ThemePreference,
  storage: ThemeStorageWriter,
): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
}

export function resolveTheme(
  preference: ThemePreference,
): ResolvedTheme {
  return preference;
}
