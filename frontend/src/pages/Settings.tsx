import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { api, errorMessage, type AlertLog, type AlertPreference, type GuideCharacter, type Role } from "../api/client"
import GuideAvatar from "../components/guide/GuideAvatar"
import TopBar from "../components/ui/TopBar"
import type { TranslationKey } from "../i18n/en"
import { LogoutIcon, MoonIcon, SunIcon } from "../components/ui/Icon"
import { useToast } from "../components/ui/Toast"
import { SUPPORTED_LOCALES, useT } from "../i18n"
import { useAuth } from "../state/auth"
import { nextOnboardingPath } from "../state/onboardingRouting"
import { useTheme } from "../state/theme"

const ROLE_OPTIONS: { value: Role; label: TranslationKey }[] = [
  { value: "farmer", label: "settings.role.farmer" },
  { value: "lab", label: "settings.role.lab" },
  { value: "both", label: "settings.role.both" },
]
const GUIDES: GuideCharacter[] = ["didi", "bhaiya"]

export default function Settings() {
  const { t, setLocale } = useT()
  const { tenant, refreshTenant, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const toast = useToast()
  const navigate = useNavigate()
  const [alertPref, setAlertPref] = useState<AlertPreference | null>(null)
  const [emailInput, setEmailInput] = useState("")
  const [webhookInput, setWebhookInput] = useState("")
  const [alertHistory, setAlertHistory] = useState<AlertLog[] | null>(null)

  useEffect(() => {
    api.getAlertPreference().then((p) => {
      setAlertPref(p)
      setEmailInput(p.alert_email ?? "")
      setWebhookInput(p.alert_webhook_url ?? "")
    })
    api.alertHistory().then(setAlertHistory).catch(() => setAlertHistory([]))
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
    await setLocale(language)
  }

  async function changeGuide(g: GuideCharacter) {
    await api.setGuide(g)
    await refreshTenant()
  }

  async function saveAlerts() {
    try {
      const p = await api.setAlertPreference({
        alert_email: emailInput || null,
        alert_webhook_url: webhookInput || null,
      })
      setAlertPref(p)
      toast.success(t("settings.saved"))
    } catch (err) {
      toast.error(errorMessage(err, t("settings.save_error")))
    }
  }

  async function sendTest() {
    try {
      const r = await api.testAlert()
      toast.info(r.message)
      setAlertHistory(await api.alertHistory())
    } catch (err) {
      toast.error(errorMessage(err, t("settings.send_error")))
    }
  }

  if (!tenant) return null

  return (
    <div className="min-h-dvh ambient-leaf-bg pb-10">
      <TopBar />
      <div className="max-w-md mx-4 sm:mx-auto bg-white dark:bg-gray-800 rounded-3xl surface p-6 sm:p-8 space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-gray-900 dark:text-gray-100">{t("settings.title")}</h1>
          <Link to={tenant.role === "lab" ? "/lab" : "/farmer"} className="text-leaf-600 dark:text-leaf-500 font-semibold">← {t("common.back")}</Link>
        </div>

        {tenant.role !== "lab" && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("settings.helper")}</p>
            <div className="grid grid-cols-2 gap-3">
              {GUIDES.map((g) => (
                <button
                  key={g} onClick={() => changeGuide(g)} aria-pressed={tenant.guide_character === g}
                  className={`rounded-2xl border-4 p-2 flex flex-col items-center cursor-pointer ${
                    tenant.guide_character === g ? "border-leaf-600 bg-leaf-50 dark:bg-leaf-700/20" : "border-transparent bg-gray-50 dark:bg-gray-700/40"
                  }`}
                >
                  <GuideAvatar who={g} size={64} />
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{t(`guide.${g}.name`)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("settings.appearance")}</p>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-leaf-500 transition-colors cursor-pointer"
          >
            {theme === "dark" ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
            {theme === "dark" ? t("settings.dark") : t("settings.light")}
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("settings.role")}</p>
          <div className="flex gap-2 flex-wrap">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value} onClick={() => changeRole(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors cursor-pointer ${
                  tenant.role === opt.value
                    ? "bg-leaf-600 text-white border-leaf-600"
                    : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-leaf-500"
                }`}
              >
                {t(opt.label)}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t("settings.role_hint")}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("settings.language")}</p>
          <div className="flex gap-2">
            {SUPPORTED_LOCALES.map((l) => (
              <button
                key={l.code} onClick={() => changeLanguage(l.code)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors cursor-pointer ${
                  tenant.language === l.code
                    ? "bg-leaf-600 text-white border-leaf-600"
                    : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-leaf-500"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("settings.tier")}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t(`tier.${tenant.tier}`)}</p>
        </div>

        <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("settings.alerts")}</p>
          {alertPref && !alertPref.email_allowed && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t("settings.alerts_not_included", { tier: t(`tier.${tenant.tier}`) })}
            </p>
          )}
          {alertPref?.email_allowed && (
            <input
              type="email" placeholder={t("settings.alert_email")} value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
          )}
          {alertPref?.webhook_allowed && (
            <input
              placeholder={t("settings.webhook")} value={webhookInput}
              onChange={(e) => setWebhookInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
          )}
          {alertPref?.email_allowed && (
            <div className="flex gap-2">
              <button onClick={saveAlerts} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors cursor-pointer">{t("settings.save")}</button>
              <button onClick={sendTest} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-leaf-500 transition-colors cursor-pointer">{t("settings.send_test")}</button>
            </div>
          )}

          {alertHistory && alertHistory.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("settings.recent_alerts")}</p>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {alertHistory.map((log) => (
                  <li key={log.id} className="text-xs text-gray-500 dark:text-gray-400 border-l-2 border-gray-200 dark:border-gray-600 pl-2">
                    {t("settings.alert_to", { channel: log.channel, destination: log.destination, when: new Date(log.created_at).toLocaleString() })}
                    {log.simulated && <span className="text-amber-700 dark:text-amber-400"> {t("settings.simulated")}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <Link to="/admin" className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">{t("settings.admin")}</Link>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-stress-600 font-medium hover:text-stress-500 cursor-pointer">
            <LogoutIcon className="w-4 h-4" /> {t("settings.logout")}
          </button>
        </div>
      </div>
    </div>
  )
}
