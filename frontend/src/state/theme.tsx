import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "light" | "dark"

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null)

function resolveInitialTheme(): Theme {
  const stored = localStorage.getItem("ph_theme")
  if (stored === "light" || stored === "dark") return stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/** Class-based dark mode (`.dark` on <html>), persisted to localStorage and defaulting
 * to the OS preference on first visit. Kept as a tiny context rather than prop-drilling —
 * only Settings' toggle and this provider ever need to touch it directly. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    localStorage.setItem("ph_theme", theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
