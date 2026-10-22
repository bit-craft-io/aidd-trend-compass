import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeChoice = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

interface ThemeContextValue {
  themeChoice: ThemeChoice;
  effectiveTheme: EffectiveTheme;
  setThemeChoice: (choice: ThemeChoice) => void;
}

const STORAGE_KEY = "trend-compass-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredThemeChoice(): ThemeChoice {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeChoice, setThemeChoiceState] = useState<ThemeChoice>(readStoredThemeChoice);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(prefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const effectiveTheme: EffectiveTheme = useMemo(() => {
    if (themeChoice === "system") {
      return systemPrefersDark ? "dark" : "light";
    }
    return themeChoice;
  }, [themeChoice, systemPrefersDark]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", effectiveTheme);
  }, [effectiveTheme]);

  const setThemeChoice = useCallback((choice: ThemeChoice) => {
    setThemeChoiceState(choice);
    window.localStorage.setItem(STORAGE_KEY, choice);
  }, []);

  const value = useMemo(
    () => ({ themeChoice, effectiveTheme, setThemeChoice }),
    [themeChoice, effectiveTheme, setThemeChoice]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
