import { Link } from "react-router-dom"
import PlantStage from "../components/plant/PlantStage"
import TopBar from "../components/ui/TopBar"
import { useT } from "../i18n"
import { DECORATIVE_LOOK } from "../lib/plantLook"

/** The first thing anyone sees: a big spinnable 3D plant (always healthy — decorative, never
 * a reading), one line of promise, two big buttons, and the language switch. */
export default function Welcome() {
  const { t } = useT()
  const points = [
    { icon: "💧", text: t("welcome.point1") },
    { icon: "🧑‍🌾", text: t("welcome.point2") },
    { icon: "🚿", text: t("welcome.point3") },
  ]
  return (
    <div className="min-h-dvh ambient-leaf-bg flex flex-col">
      <TopBar />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pb-10 grid md:grid-cols-2 gap-6 items-center">
        <div className="order-1 md:order-2 animate-fade-in">
          <PlantStage look={DECORATIVE_LOOK} size="hero" label={t("app.name")} />
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 -mt-2">↔ {t("welcome.spin_hint")}</p>
        </div>
        <div className="order-2 md:order-1 space-y-6 text-center md:text-left animate-fade-in">
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-leaf-700 dark:text-leaf-500 leading-tight">
            {t("app.tagline")}
          </h1>
          <ul className="space-y-3 text-left max-w-md mx-auto md:mx-0">
            {points.map((p) => (
              <li key={p.text} className="flex items-start gap-3 rounded-2xl bg-white/70 dark:bg-gray-800/70 surface px-4 py-3">
                <span className="text-2xl leading-none" aria-hidden>{p.icon}</span>
                <span className="text-gray-700 dark:text-gray-200">{p.text}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto md:mx-0">
            <Link to="/register" className="btn-3d flex-1 text-center rounded-2xl bg-leaf-600 hover:bg-leaf-700 text-white text-lg font-semibold py-4 px-6">
              {t("welcome.get_started")}
            </Link>
            <Link to="/login" className="btn-3d flex-1 text-center rounded-2xl bg-white dark:bg-gray-800 text-leaf-700 dark:text-leaf-500 text-lg font-semibold py-4 px-6">
              {t("welcome.login")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
