import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ApiError } from "../api/client"
import AuthShell, { inputClass, labelClass } from "../components/ui/AuthShell"
import { useT } from "../i18n"
import { useAuth } from "../state/auth"

export default function Login() {
  const { login } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      navigate("/")
    } catch (err) {
      setError(err instanceof ApiError ? t("auth.login.error") : t("auth.generic_error"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="bg-white dark:bg-gray-800 rounded-3xl surface p-6 sm:p-8 space-y-5 animate-fade-in">
        <div>
          <h1 className="font-display text-3xl font-semibold text-leaf-700 dark:text-leaf-500">{t("auth.login.title")}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t("auth.login.subtitle")}</p>
        </div>

        <label className="block space-y-1.5">
          <span className={labelClass}>📧 {t("auth.email")}</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1.5">
          <span className={labelClass}>🔒 {t("auth.password")}</span>
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </label>

        {error && <p role="alert" className="text-stress-600 font-medium">{error}</p>}

        <button type="submit" disabled={busy} className="btn-3d w-full rounded-2xl bg-leaf-600 hover:bg-leaf-700 text-white text-lg font-semibold py-4 disabled:opacity-60 cursor-pointer">
          {busy ? t("auth.login.busy") : t("auth.login.button")}
        </button>

        <p className="text-center text-gray-600 dark:text-gray-400">
          {t("auth.no_account")} <Link to="/register" className="text-leaf-600 dark:text-leaf-500 font-semibold underline-offset-2 hover:underline">{t("auth.register.link")}</Link>
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center break-words">{t("auth.demo_hint")}</p>
      </form>
    </AuthShell>
  )
}
