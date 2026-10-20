import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ApiError, api, type OnboardingOut, type PlantOut } from "../api/client"
import { useT } from "../i18n"
import { useAuth } from "../state/auth"

interface PredictResult {
  stressed: boolean
  class_label: string | null
  confidence_band: string | null
  confidence_pct: number | null
  diagnosis_remedy_available: boolean
}

const WATERING_REMEDY: Record<string, string> = {
  drip: "Check the drip line for clogs near this block before assuming the plant itself is stressed.",
  flood: "With flood irrigation, a water-stressed reading often means the last flood didn't reach this block evenly.",
  sprinkler: "Check sprinkler coverage near this block — uneven spray is a common cause of a stressed reading here.",
  rain_fed: "No scheduled irrigation to check — a stressed reading here is more likely a genuine dry spell.",
}

/**
 * A genuinely farmer-shaped landing, built from what onboarding actually captured — not a
 * stripped-down lab view. Full field map lands in step 5; this proves the fork already
 * changes behavior per the brief's "if picking farmer changes nothing, the fork is fake."
 */
export default function FarmerHome() {
  const { t } = useT()
  const { tenant } = useAuth()
  const [onboarding, setOnboarding] = useState<OnboardingOut | null>(null)
  const [plant, setPlant] = useState<PlantOut | null>(null)
  const [result, setResult] = useState<PredictResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [capNotice, setCapNotice] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Guards against React StrictMode's dev-mode double-invoke of effects: this effect does
  // real POSTs (create a demo plant, run a prediction), which must happen at most once per
  // mount — re-running it would silently drop state set during the first (discarded) pass
  // and risks duplicate writes, not just a cosmetic double-render.
  const didInit = useRef(false)

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    ;(async () => {
      try {
        const ob = await api.getOnboarding()
        setOnboarding(ob)

        const plants = await api.listPlants()
        let first = plants[0] ?? null
        if (!first) {
          // first visit — create a demo plant (a sentinel-centered block) so there's
          // something to show, sized from the farmer's own onboarding answers. Those
          // answers were collected before any tier was chosen or checked, so this can
          // legitimately exceed the account's tier limit (section 9) — handled below,
          // not assumed away.
          const devices = await api.listDevices()
          const requestedCoverage = ob.farmer?.sensor_count
            ? Math.round((ob.farmer.plant_count ?? 100) / ob.farmer.sensor_count)
            : 10
          try {
            first = await api.createPlant({
              label: "Block 1", device_id: devices[0]?.id ?? null, covered_count: requestedCoverage,
            })
          } catch (err) {
            if (err instanceof ApiError && (err.detail as { error?: string })?.error === "plants covered_limit_reached") {
              // section 9: "explain what they'd get rather than just blocking them" —
              // same principle applies here, not only at the device/plant CRUD layer.
              const { limits } = await api.myTierLimits()
              const cap = limits.max_plants_covered ?? requestedCoverage
              first = await api.createPlant({ label: "Block 1", device_id: devices[0]?.id ?? null, covered_count: cap })
              const pitch = (err.detail as { upgrade_pitch?: string })?.upgrade_pitch
              setCapNotice(
                `Your setup answers cover ${requestedCoverage} plants, but your ${tenant?.tier} plan tracks up to ${cap}. ` +
                `Showing your first ${cap}.` + (pitch ? ` ${pitch}` : ""),
              )
            } else {
              throw err
            }
          }
        }
        setPlant(first)
        if (first) {
          const pred = await api.predict(first.id)
          setResult(pred.result as unknown as PredictResult)
        }
      } catch (err) {
        setLoadError(err instanceof ApiError ? String(err.detail) : "Something went wrong loading your field.")
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const farmer = onboarding?.farmer
  const verdict = result?.stressed ? t("farmer.home.verdict.stressed") : t("farmer.home.verdict.healthy")
  const confidenceWord = result?.confidence_band
    ? t(
        result.confidence_band === "fairly sure"
          ? "farmer.home.confidence.fairly_sure"
          : result.confidence_band === "uncertain"
            ? "farmer.home.confidence.uncertain"
            : "farmer.home.confidence.not_sure",
      )
    : null

  return (
    <div className="min-h-dvh bg-leaf-50">
      <div className="bg-amber-100 text-amber-900 text-center text-sm font-medium py-2 px-4">
        ⚠️ {t("farmer.home.demo_banner")}
      </div>

      <header className="flex items-center justify-between px-4 py-4 max-w-2xl mx-auto">
        <h1 className="text-lg font-semibold text-leaf-700">{t("app.name")}</h1>
        <Link to="/settings" className="text-sm text-gray-500">⚙️ {t("settings.title")}</Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-16 space-y-6">
        {farmer && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t("farmer.home.coverage")}</p>
            <p className="text-lg font-semibold text-gray-800">{onboarding?.coverage_ratio_text}</p>
            <p className="text-xs text-gray-400 mt-1">
              {farmer.watering_method} irrigation · {farmer.salinity_history === "yes" ? "known salinity history" : farmer.salinity_history === "no" ? "no salinity history" : "salinity history unknown"}
              {farmer.region ? ` · ${farmer.region}` : ""}
            </p>
          </div>
        )}

        {loading && <p className="text-center text-gray-400 py-12">Loading your field…</p>}

        {!loading && loadError && (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center text-stress-600">{loadError}</div>
        )}

        {capNotice && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            {capNotice}
          </div>
        )}

        {!loading && result && (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center space-y-3">
            <p className="text-sm text-gray-400">{plant?.label ?? "Block 1"} · {plant?.covered_count} plants</p>
            <h2 className={`text-2xl font-bold ${result.stressed ? "text-stress-600" : "text-leaf-700"}`}>
              {result.class_label ? `${result.class_label[0].toUpperCase()}${result.class_label.slice(1)} stress suspected` : verdict}
            </h2>
            {confidenceWord && <p className="text-gray-500">{confidenceWord}</p>}
            {result.confidence_pct != null && <p className="text-gray-400 text-sm">{result.confidence_pct}%</p>}

            <div className="pt-4 border-t border-gray-100 text-left">
              <p className="font-medium text-gray-700 mb-1">{t("farmer.home.what_to_do")}</p>
              {result.diagnosis_remedy_available && farmer ? (
                <p className="text-sm text-gray-600">{WATERING_REMEDY[farmer.watering_method]}</p>
              ) : (
                <p className="text-sm text-gray-400">{t("farmer.home.upgrade_for_remedy")}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                General guidance only, not a diagnosis. Alerting preference: {farmer?.alert_threshold === "tell_me_early" ? "tell me early" : "only when fairly sure"}.
              </p>
            </div>
          </div>
        )}

        {!loading && (
          <p className="text-center text-xs text-gray-400">
            Tier: {tenant?.tier} · {tenant?.tier === "basic" ? "upgrade for which-of-4-states and exact confidence" : ""}
          </p>
        )}
      </main>
    </div>
  )
}
