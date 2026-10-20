import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ApiError, api, type AlertPreference, type Role } from "../api/client"
import { SUPPORTED_LOCALES, useT } from "../i18n"
import { useAuth } from "../state/auth"
import { nextOnboardingPath } from "../state/onboardingRouting"

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "farmer", label: "Growing plants" },
  { value: "lab", label: "Studying them" },
  { value: "both", label: "Both" },
]

export default function Settings() {
  const { t } = useT()
  const { tenant, refreshTenant, logout } = useAuth()
  const navigate = useNavigate()
  const [alertPref, setAlertPref] = useState<AlertPreference | null>(null)
  const [emailInput, setEmailInput] = useState("")
  const [webhookInput, setWebhookInput] = useState("")
  const [testResult, setTestResult] = useState<string | null>(null)
  const [alertError, setAlertError] = useState<string | null>(null)

  useEffect(() => {
    api.getAlertPreference().then((p) => {
      setAlertPref(p)
      setEmailInput(p.alert_email ?? "")
      setWebhookInput(p.alert_webhook_url ?? "")
    })
  }, [])

  async function changeRole(role: Role) {
    await api.setRole(role)
    await refreshTenant()
    // Same source of truth App.tsx's Gate uses — for a "both" account this correctly
    // sends you to whichever of farmer/lab is still missing, not always the farmer wizard.
    const ob = await api.getOnboarding()
    const pending = nextOnboardingPath(role, ob)
    navigate(pending ?? (role === "lab" ? "/lab" : "/farmer"))
  }

  async function changeLanguage(language: string) {
    await api.setLanguage(language)
    await refreshTenant()
  }

  async function saveAlerts() {
    setAlertError(null)
    setTestResult(null)
    try {
      const p = await api.setAlertPreference({
        alert_email: emailInput || null,
        alert_webhook_url: webhookInput || null,
      })
      setAlertPref(p)
    } catch (err) {
      setAlertError(err instanceof ApiError ? (err.detail as { message?: string })?.message ?? String(err.detail) : "Could not save.")
    }
  }

  async function sendTest() {
    setTestResult(null)
    setAlertError(null)
    try {
      const r = await api.testAlert()
      setTestResult(r.message)
    } catch (err) {
      setAlertError(err instanceof ApiError ? (err.detail as { message?: string })?.message ?? String(err.detail) : "Could not send.")
    }
  }

  if (!tenant) return null

  return (
    <div className="min-h-dvh bg-gray-50 px-4 py-10">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm p-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
          <Link to={tenant.role === "lab" ? "/lab" : "/farmer"} className="text-sm text-leaf-600">← Back</Link>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">{t("settings.role")}</p>
          <div className="flex gap-2 flex-wrap">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value} onClick={() => changeRole(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm border ${
                  tenant.role === opt.value ? "bg-leaf-600 text-white border-leaf-600" : "border-gray-300 text-gray-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Switching to a role without a completed onboarding will take you through that setup.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">{t("settings.language")}</p>
          <div className="flex gap-2">
            {SUPPORTED_LOCALES.map((l) => (
              <button
                key={l.code} onClick={() => changeLanguage(l.code)}
                className={`px-4 py-2 rounded-lg text-sm border ${
                  tenant.language === l.code ? "bg-leaf-600 text-white border-leaf-600" : "border-gray-300 text-gray-600"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-700">{t("settings.tier")}</p>
          <p className="text-sm text-gray-500 capitalize">{tenant.tier}</p>
        </div>

        <div className="space-y-2 pt-2 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700">Alerts</p>
          {alertPref && !alertPref.email_allowed && (
            <p className="text-xs text-gray-400">
              Not included in the {tenant.tier} plan. Premium adds email alerts; Pro adds email + webhook.
            </p>
          )}
          {alertPref?.email_allowed && (
            <input
              type="email" placeholder="alert email" value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          )}
          {alertPref?.webhook_allowed && (
            <input
              placeholder="webhook URL" value={webhookInput}
              onChange={(e) => setWebhookInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          )}
          {alertPref?.email_allowed && (
            <div className="flex gap-2">
              <button onClick={saveAlerts} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-white">Save</button>
              <button onClick={sendTest} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600">Send test alert</button>
            </div>
          )}
          {testResult && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">{testResult}</p>
          )}
          {alertError && <p className="text-xs text-stress-600">{alertError}</p>}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <Link to="/admin" className="text-sm text-gray-400">Admin dashboard →</Link>
          <button onClick={logout} className="text-sm text-stress-600 font-medium">Log out</button>
        </div>
      </div>
    </div>
  )
}
