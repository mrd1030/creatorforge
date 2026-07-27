import React, { createContext, useContext, useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/storage";

type Theme = "light" | "dark";
interface Ctx { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void; }
const ThemeCtx = createContext<Ctx>({ theme: "light", toggle: () => {}, setTheme: () => {} });

function getInitial(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(THEME_KEY) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitial);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark"); else root.classList.remove("dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggle = () => setThemeState(p => (p === "dark" ? "light" : "dark"));

  return <ThemeCtx.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
