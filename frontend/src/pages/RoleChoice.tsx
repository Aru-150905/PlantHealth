import { useNavigate } from "react-router-dom"
import { api } from "../api/client"
import GuideAvatar from "../components/guide/GuideAvatar"
import TopBar from "../components/ui/TopBar"
import { useT } from "../i18n"
import { useAuth } from "../state/auth"
import type { Role } from "../api/client"

/**
 * The very first question (section 5): "Are you growing plants, or studying them?" Two
 * buttons, nothing else to decide. The answer forks everything downstream. Growers go on to
 * pick their helper (GuidePicker) before the farmer questions.
 */
export default function RoleChoice() {
  const { refreshTenant } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()

  async function choose(role: Role) {
    await api.setRole(role)
    await refreshTenant()
    navigate(role === "lab" ? "/onboarding/lab" : "/guide?next=/onboarding/farmer")
  }

  return (
    <div className="min-h-dvh ambient-leaf-bg flex flex-col">
      <TopBar />
      <main className="flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-lg text-center space-y-10 animate-fade-in">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-gray-800 dark:text-gray-100">{t("role.question")}</h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <button
              onClick={() => choose("farmer")}
              className="btn-3d rounded-3xl bg-leaf-600 hover:bg-leaf-700 text-white text-xl font-semibold py-8 px-6 cursor-pointer flex flex-col items-center gap-2"
            >
              <span className="flex -space-x-6">
                <GuideAvatar who="didi" size={64} />
                <GuideAvatar who="bhaiya" size={64} />
              </span>
              {t("role.farmer")}
            </button>
            <button
              onClick={() => choose("lab")}
              className="btn-3d rounded-3xl bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-xl font-semibold py-8 px-6 cursor-pointer flex flex-col items-center gap-2"
            >
              <span className="text-6xl leading-[80px]" aria-hidden>🔬</span>
              {t("role.lab")}
            </button>
          </div>
          <p className="text-gray-500 dark:text-gray-400">{t("role.change_hint")}</p>
        </div>
      </main>
    </div>
  )
}
