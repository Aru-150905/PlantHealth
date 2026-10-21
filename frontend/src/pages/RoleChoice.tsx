import { useNavigate } from "react-router-dom"
import { api } from "../api/client"
import { useT } from "../i18n"
import { useAuth } from "../state/auth"
import type { Role } from "../api/client"

/**
 * The very first screen (section 5): "Are you growing plants, or studying them?" Two
 * buttons, nothing else. The answer forks everything downstream — see
 * src/pages/onboarding/{Farmer,Lab}Onboarding.tsx and src/pages/{Farmer,Lab}Home.tsx.
 */
export default function RoleChoice() {
  const { refreshTenant } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()

  async function choose(role: Role) {
    await api.setRole(role)
    await refreshTenant()
    navigate(role === "lab" ? "/onboarding/lab" : "/onboarding/farmer")
  }

  return (
    <div className="min-h-dvh flex items-center justify-center ambient-leaf-bg px-4">
      <div className="w-full max-w-lg text-center space-y-10 animate-fade-in">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-gray-800 dark:text-gray-100">{t("role.question")}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <button
            onClick={() => choose("farmer")}
            className="btn-3d rounded-2xl bg-leaf-600 hover:bg-leaf-700 text-white text-lg font-medium py-10 px-6 cursor-pointer"
          >
            🌱 {t("role.farmer")}
          </button>
          <button
            onClick={() => choose("lab")}
            className="btn-3d rounded-2xl bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-lg font-medium py-10 px-6 cursor-pointer"
          >
            🔬 {t("role.lab")}
          </button>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("role.change_hint")}</p>
      </div>
    </div>
  )
}
