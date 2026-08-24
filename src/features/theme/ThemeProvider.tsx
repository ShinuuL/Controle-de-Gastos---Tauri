import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "./themePreference";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const fallbackTheme: ThemeContextValue = {
  preference: "system",
  resolvedTheme: "light",
  setPreference: () => undefined,
};

const ThemeContext = createContext<ThemeContextValue>(fallbackTheme);

function storageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setStoredPreference] = useState<ThemePreference>(() =>
    readThemePreference(storageOrNull() ?? { getItem: () => null }),
  );
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  const resolvedTheme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (preference !== "system" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };

    setPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      setPreference: (nextPreference) => {
        writeThemePreference(nextPreference, storageOrNull() ?? { setItem: () => undefined });
        setStoredPreference(nextPreference);
      },
    }),
    [preference, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
