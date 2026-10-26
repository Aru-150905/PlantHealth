/**
 * The language picked before an account exists (welcome / login / register screens). After
 * login the tenant's saved `language` is the source of truth (main.tsx); this is only the
 * pre-login choice, and what register() sends as the new account's language. Wrapped in
 * try/catch because storage can be blocked (private mode, site-data settings).
 */
const KEY = "ph_locale"
const SUPPORTED = new Set(["en", "hi"])

export function readStoredLocale(): string {
  try {
    const v = localStorage.getItem(KEY)
    return v && SUPPORTED.has(v) ? v : "en"
  } catch {
    return "en"
  }
}

export function storeLocale(locale: string): void {
  try {
    localStorage.setItem(KEY, locale)
  } catch {
    // storage blocked — the choice just won't survive a reload
  }
}

/** If the language was switched on the welcome/login screen during this visit and differs
 * from the account's saved one, the farmer's latest choice wins after login — a farmer who
 * just tapped हिन्दी shouldn't be flipped back to English the moment they sign in. */
export function localeToCarryIntoAccount({
  pickedBeforeLogin, chosen, accountLanguage,
}: { pickedBeforeLogin: boolean; chosen: string; accountLanguage: string }): string | null {
  return pickedBeforeLogin && chosen !== accountLanguage ? chosen : null
}
