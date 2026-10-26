import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api, type GuideCharacter } from "../api/client"
import GuideAvatar from "../components/guide/GuideAvatar"
import TopBar from "../components/ui/TopBar"
import { useToast } from "../components/ui/Toast"
import { useT } from "../i18n"
import { useSpeech } from "../lib/speech"
import { useAuth } from "../state/auth"

const OPTIONS: GuideCharacter[] = ["didi", "bhaiya"]

/** Shown once, before farmer onboarding: the farmer picks the helper who'll guide them.
 * Changeable later in Settings. */
export default function GuidePicker() {
  const { t, locale } = useT()
  const { tenant, refreshTenant } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [picked, setPicked] = useState<GuideCharacter>(tenant?.guide_character ?? "didi")
  const [saving, setSaving] = useState(false)
  const { available, speak } = useSpeech(locale)

  function choose(g: GuideCharacter) {
    setPicked(g)
    if (available) speak(t(`guide.${g}.intro`))
  }

  async function next() {
    setSaving(true)
    try {
      await api.setGuide(picked)
      await refreshTenant()
      const target = params.get("next")
      navigate(target && target.startsWith("/") ? target : "/onboarding/farmer")
    } catch {
      toast.error(t("auth.generic_error"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh ambient-leaf-bg flex flex-col">
      <TopBar />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 pb-10 flex flex-col justify-center gap-6 animate-fade-in">
        <div className="text-center space-y-2">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-leaf-700 dark:text-leaf-500">{t("guide.pick.title")}</h1>
          <p className="text-gray-600 dark:text-gray-300">{t("guide.pick.subtitle")}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {OPTIONS.map((g) => (
            <button
              key={g} type="button" onClick={() => choose(g)} aria-pressed={picked === g}
              className={`btn-3d rounded-3xl p-4 flex flex-col items-center gap-3 cursor-pointer border-4 ${
                picked === g ? "border-leaf-600 bg-white dark:bg-gray-800" : "border-transparent bg-white/70 dark:bg-gray-800/60"
              }`}
            >
              <GuideAvatar who={g} mood={picked === g ? "happy" : "idle"} size={110} />
              <span className="text-xl font-semibold text-gray-800 dark:text-gray-100">{t(`guide.${g}.name`)}</span>
              <span className="text-sm text-gray-600 dark:text-gray-300 leading-snug">{t(`guide.${g}.intro`)}</span>
              {picked === g && <span className="text-leaf-600 text-2xl" aria-hidden>✓</span>}
            </button>
          ))}
        </div>
        <button
          type="button" onClick={next} disabled={saving}
          className="btn-3d self-center rounded-2xl bg-leaf-600 hover:bg-leaf-700 text-white text-lg font-semibold py-4 px-12 disabled:opacity-60 cursor-pointer"
        >
          {t("guide.pick.continue")} →
        </button>
      </main>
    </div>
  )
}
