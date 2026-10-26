import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { readStoredLocale } from "./locale"
import { api, setAuthToken, type OnboardingOut, type Tenant, type Tier } from "../api/client"

const TOKEN_KEY = "planthealth.token"

interface AuthContextValue {
  token: string | null
  tenant: Tenant | null
  onboarding: OnboardingOut | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (tenantName: string, email: string, password: string, tier: Tier, language?: string) => Promise<void>
  logout: () => void
  refreshTenant: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [onboarding, setOnboarding] = useState<OnboardingOut | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setAuthToken(token)
  }, [token])

  // tenant and onboarding are always set TOGETHER, from one account, never independently —
  // setting tenant alone (e.g. straight from a login response) while onboarding still holds
  // a previous account's data lets a route guard briefly pair account A's role with account
  // B's onboarding profile. Found via manual testing: switching accounts could get stuck on
  // the wrong onboarding wizard because nothing re-checks once that mismatched render lands
  // on a RequireAccount-only route. See ~/Desktop/PlantHealth-Decisions for the writeup.
  const loadAccount = useCallback(async (): Promise<boolean> => {
    try {
      const t = await api.myTenant()
      const ob = t.role === "unset" ? null : await api.getOnboarding()
      setTenant(t)
      setOnboarding(ob)
      return true
    } catch {
      return false
    }
  }, [])

  const refreshTenant = useCallback(async () => {
    if (!token) {
      setTenant(null)
      setOnboarding(null)
      return
    }
    const ok = await loadAccount()
    if (!ok) {
      // token expired/invalid — drop it rather than looping on a failing call
      localStorage.removeItem(TOKEN_KEY)
      setToken(null)
      setTenant(null)
      setOnboarding(null)
    }
  }, [token, loadAccount])

  useEffect(() => {
    refreshTenant().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password)
    localStorage.setItem(TOKEN_KEY, res.access_token)
    setAuthToken(res.access_token) // so the loadAccount() call below is already authenticated
    await loadAccount()
    setToken(res.access_token)
  }, [loadAccount])

  const register = useCallback(async (tenant_name: string, email: string, password: string, tier: Tier, language?: string) => {
    // the language picked on the welcome/login screens becomes the account's language — the
    // live choice passed in by Register, falling back to the stored one
    const res = await api.register({ tenant_name, email, password, tier, language: language ?? readStoredLocale() })
    localStorage.setItem(TOKEN_KEY, res.access_token)
    setAuthToken(res.access_token)
    await loadAccount()
    setToken(res.access_token)
  }, [loadAccount])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setTenant(null)
    setOnboarding(null)
  }, [])

  const value = useMemo(
    () => ({ token, tenant, onboarding, loading, login, register, logout, refreshTenant }),
    [token, tenant, onboarding, loading, login, register, logout, refreshTenant],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth() must be used within an AuthProvider")
  return ctx
}
