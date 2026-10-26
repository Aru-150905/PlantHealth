import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import type { Tier } from "../api/client"
import AuthShell, { inputClass, labelClass } from "../components/ui/AuthShell"
import { useT } from "../i18n"
import { useAuth } from "../state/auth"

const TIERS: Tier[] = ["basic", "premium", "pro"]

export default function Register() {
  const { register } = useAuth()
  const { t, locale } = useT()
  const navigate = useNavigate()
  const [tenantName, setTenantName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [tier, setTier] = useState<Tier>("basic")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await register(tenantName, email, password, tier, locale)
      navigate("/") // -> role choice, since a new account's role is "unset"
    } catch {
      setError(t("auth.register.error"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="bg-white dark:bg-gray-800 rounded-3xl surface p-6 sm:p-8 space-y-5 animate-fade-in">
        <div>
          <h1 className="font-display text-3xl font-semibold text-leaf-700 dark:text-leaf-500">{t("auth.register.title")}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t("auth.register.subtitle")}</p>
        </div>

        <label className="block space-y-1.5">
          <span className={labelClass}>🏡 {t("auth.farm_name")}</span>
          <input required value={tenantName} onChange={(e) => setTenantName(e.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1.5">
          <span className={labelClass}>📧 {t("auth.email")}</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1.5">
          <span className={labelClass}>🔒 {t("auth.password")}</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          <span className="block text-sm text-gray-400 dark:text-gray-500">{t("auth.password_hint")}</span>
        </label>

        <fieldset className="space-y-1.5">
          <legend className={labelClass}>{t("auth.plan")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {TIERS.map((v) => (
              <button
                key={v} type="button" onClick={() => setTier(v)} aria-pressed={tier === v}
                className={`rounded-xl py-3 font-semibold border-2 transition-colors cursor-pointer ${
                  tier === v
                    ? "border-leaf-600 bg-leaf-50 dark:bg-leaf-700/20 text-leaf-700 dark:text-leaf-500"
                    : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                }`}
              >
                {t(`tier.${v}`)}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">{t("auth.plan_hint")}</p>
        </fieldset>

        {error && <p role="alert" className="text-stress-600 font-medium">{error}</p>}

        <button type="submit" disabled={busy} className="btn-3d w-full rounded-2xl bg-leaf-600 hover:bg-leaf-700 text-white text-lg font-semibold py-4 disabled:opacity-60 cursor-pointer">
          {busy ? t("auth.register.busy") : t("auth.register.button")}
        </button>

        <p className="text-center text-gray-600 dark:text-gray-400">
          {t("auth.have_account")} <Link to="/login" className="text-leaf-600 dark:text-leaf-500 font-semibold hover:underline">{t("auth.login.link")}</Link>
        </p>
      </form>
    </AuthShell>
  )
}
