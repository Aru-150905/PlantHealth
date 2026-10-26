import { StrictMode, useCallback, useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App.tsx"
import "./index.css"
import { api } from "./api/client"
import { ToastProvider } from "./components/ui/Toast"
import { I18nProvider } from "./i18n"
import { AuthProvider, useAuth } from "./state/auth"
import { localeToCarryIntoAccount, readStoredLocale, storeLocale } from "./state/locale"
import { ThemeProvider } from "./state/theme"

/** Keeps the i18n locale in sync with the signed-in tenant's saved language (section 5
 * Q9). Before login it's the choice made on the welcome/login screens (state/locale.ts),
 * which also becomes the new account's language on register. */
function LocalizedApp() {
  const { tenant, refreshTenant } = useAuth()
  const [preLoginLocale, setPreLoginLocale] = useState(readStoredLocale)
  const locale = tenant?.language ?? preLoginLocale

  // true once the language is switched while signed out, during this visit
  const pickedBeforeLogin = useRef(false)

  const onLocaleChange = useCallback(async (l: string) => {
    storeLocale(l)
    setPreLoginLocale(l)
    if (!tenant) {
      pickedBeforeLogin.current = true
      return
    }
    try {
      await api.setLanguage(l)
      await refreshTenant()
    } catch {
      // the switch still applies on this device (stored locally); the account keeps its old value
    }
  }, [tenant, refreshTenant])

  useEffect(() => {
    if (!tenant) return
    const carry = localeToCarryIntoAccount({
      pickedBeforeLogin: pickedBeforeLogin.current, chosen: preLoginLocale, accountLanguage: tenant.language,
    })
    pickedBeforeLogin.current = false
    if (carry) api.setLanguage(carry).then(refreshTenant).catch(() => {})
  }, [tenant, preLoginLocale, refreshTenant])

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
