import { StrictMode, useCallback, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App.tsx"
import "./index.css"
import { api } from "./api/client"
import { ToastProvider } from "./components/ui/Toast"
import { I18nProvider } from "./i18n"
import { AuthProvider, useAuth } from "./state/auth"
import { readStoredLocale, storeLocale } from "./state/locale"
import { ThemeProvider } from "./state/theme"

/** Keeps the i18n locale in sync with the signed-in tenant's saved language (section 5
 * Q9). Before login it's the choice made on the welcome/login screens (state/locale.ts),
 * which also becomes the new account's language on register. */
function LocalizedApp() {
  const { tenant, refreshTenant } = useAuth()
  const [preLoginLocale, setPreLoginLocale] = useState(readStoredLocale)
  const locale = tenant?.language ?? preLoginLocale

  const onLocaleChange = useCallback(async (l: string) => {
    storeLocale(l)
    setPreLoginLocale(l)
    if (tenant) {
      await api.setLanguage(l)
      await refreshTenant()
    }
  }, [tenant, refreshTenant])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return (
    <I18nProvider locale={locale} onLocaleChange={onLocaleChange}>
      <App />
    </I18nProvider>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <LocalizedApp />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
