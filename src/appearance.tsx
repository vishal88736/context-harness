import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
const validTheme = (value: string | null): value is ThemeMode =>
  value === "light" || value === "dark" || value === "system";
const AppearanceContext = createContext<{
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
} | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem("canopy.theme");
      return validTheme(saved) ? saved : "light";
    } catch {
      return "light";
    }
  });
  const setTheme = useCallback((value: ThemeMode) => updateTheme(value), []);

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      const background = getComputedStyle(document.documentElement)
        .getPropertyValue("--bg")
        .trim();
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", background);
    };
    apply();
    try {
      localStorage.setItem("canopy.theme", theme);
    } catch {
      /* Private storage can be unavailable. */
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useLayoutEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === "canopy.theme" && validTheme(event.newValue))
        updateTheme(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return (
    <AppearanceContext.Provider value={{ theme, setTheme }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("AppearanceProvider is missing.");
  return value;
}
