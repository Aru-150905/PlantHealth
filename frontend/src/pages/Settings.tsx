import { Link, useNavigate } from "react-router-dom"
import { api, type Role } from "../api/client"
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

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <Link to="/admin" className="text-sm text-gray-400">Admin dashboard →</Link>
          <button onClick={logout} className="text-sm text-stress-600 font-medium">Log out</button>
        </div>
      </div>
    </div>
  )
}
