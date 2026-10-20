import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import en, { type TranslationKey } from "./en"
import hi from "./hi"

const DICTIONARIES: Record<string, Record<TranslationKey, string>> = { en, hi }

interface I18nContextValue {
  locale: string
  setLocale: (locale: string) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    template,
  )
}

export function I18nProvider({
  locale, onLocaleChange, children,
}: { locale: string; onLocaleChange: (l: string) => void; children: ReactNode }) {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES.en

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      interpolate(dict[key] ?? DICTIONARIES.en[key] ?? key, vars),
    [dict],
  )

  const value = useMemo(() => ({ locale, setLocale: onLocaleChange, t }), [locale, onLocaleChange, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useT() must be used within an I18nProvider")
  return ctx
}

export const SUPPORTED_LOCALES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
]
