import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App.tsx"
import "./index.css"
import { api } from "./api/client"
import { I18nProvider } from "./i18n"
import { AuthProvider, useAuth } from "./state/auth"

/** Keeps the i18n locale in sync with the signed-in tenant's saved language (section 5
 * Q9) — defaults to English before login or if unset. */
function LocalizedApp() {
  const { tenant } = useAuth()
  const locale = tenant?.language ?? "en"

  async function onLocaleChange(l: string) {
    if (tenant) await api.setLanguage(l)
  }

  return (
    <I18nProvider locale={locale} onLocaleChange={onLocaleChange}>
      <App />
    </I18nProvider>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LocalizedApp />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
