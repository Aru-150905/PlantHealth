import { useEffect, useRef, useState } from "react"
import {
  ApiError, api, type FieldOut, type OnboardingOut, type PlantOut,
  type PredictionResult, type TrendOut,
} from "../api/client"
import ActionPanel from "../components/farmer/ActionPanel"
import FieldRows from "../components/farmer/FieldRows"
import Guide from "../components/guide/Guide"
import type { GuideMood } from "../components/guide/GuideAvatar"
import PlantStage from "../components/plant/PlantStage"
import TrendChart from "../components/TrendChart"
import TrendSummary from "../components/TrendSummary"
import { CardSkeleton, Skeleton } from "../components/ui/Skeleton"
import { useToast } from "../components/ui/Toast"
import TopBar from "../components/ui/TopBar"
import { DownloadIcon, RefreshIcon, WarningIcon } from "../components/ui/Icon"
import { useT } from "../i18n"
import type { TranslationKey } from "../i18n/en"
import { shouldSuggestIrrigation } from "../lib/irrigation"
import { plantLook, type PlantLook } from "../lib/plantLook"
import { useAuth } from "../state/auth"

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string

function timeAgo(date: Date, now: Date, t: T): string {
  const secs = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000))
  if (secs < 10) return t("time.just_now")
  if (secs < 60) return t("time.seconds", { n: secs })
  const mins = Math.round(secs / 60)
  if (mins < 60) return t("time.minutes", { n: mins })
  return t("time.hours", { n: Math.round(mins / 60) })
}

/** The auto-created demo block is stored as "Block N" — show it in the reader's language. */
function blockName(label: string | null | undefined, t: T): string {
  const m = /^Block (\d+)$/.exec(label ?? "Block 1")
  return m ? t("farmer.home.block_name", { n: m[1] }) : (label as string)
}

/** One plain sentence for the guide: what the reading means and what to do. Tier gating is
 * unchanged — Basic never gets class-specific advice (it never learns the class). */
function adviceFor(result: PredictionResult, look: PlantLook, method: string | undefined, t: T): string {
  if (look.mood === "unknown") {
    return result.unknown_reason === "window variance below threshold" ? t("farmer.advice.unknown") : t("farmer.advice.unknown_short")
  }
  if (look.mood === "healthy") return t("farmer.advice.healthy")
  if (!result.diagnosis_remedy_available || look.mood === "unwell") return t("farmer.advice.unwell")
  if (look.mood === "drought") {
    const m = method && ["drip", "flood", "sprinkler", "rain_fed"].includes(method) ? method : "drip"
    return t(`farmer.advice.drought.${m}` as TranslationKey)
  }
  return t(look.mood === "heat" ? "farmer.advice.heat" : "farmer.advice.salinity")
}

const GUIDE_MOOD: Record<PlantLook["mood"], GuideMood> = {
  healthy: "happy", unknown: "idle", unwell: "concern", drought: "concern", heat: "concern", salinity: "concern",
}

/**
 * The farmer home (section 6), rebuilt literacy-first: the 3D plant *shows* how the block is
 * doing (lib/plantLook.ts decides what it may show), the helper says it in one sentence and
 * can read it aloud, the water/fertiliser controls sit right underneath (demo), then the
 * field and the trend. Confidence words / % stay exactly as tier-gated as before.
 */
export default function FarmerHome() {
  const { t } = useT()
  const { tenant } = useAuth()
  const toast = useToast()
  const [onboarding, setOnboarding] = useState<OnboardingOut | null>(null)
  const [plant, setPlant] = useState<PlantOut | null>(null)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [field, setField] = useState<FieldOut | null>(null)
  const [trend, setTrend] = useState<TrendOut | null>(null)
  const [trendDays, setTrendDays] = useState<1 | 7>(1)
  const [loading, setLoading] = useState(true)
  const [trendLoading, setTrendLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [cap, setCap] = useState<{ requested: number; cap: number } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [, setTick] = useState(0)
  // real POSTs happen in here (demo plant creation) — must run once per mount regardless of
  // React StrictMode's dev-mode double-invoke; see ~/Desktop/PlantHealth-Decisions
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
              const { limits } = await api.myTierLimits()
              const capCount = limits.max_plants_covered ?? requestedCoverage
              first = await api.createPlant({ label: "Block 1", device_id: devices[0]?.id ?? null, covered_count: capCount })
              setCap({ requested: requestedCoverage, cap: capCount })
            } else {
              throw err
            }
          }
        }
        setPlant(first)
        if (first) {
          const pred = await api.predict(first.id)
          setResult(pred.result)
          setField(await api.field(first.id))
          setTrend(await api.trend(first.id, 1))
          setLastUpdated(new Date())
        }
      } catch {
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keep "updated N minutes ago" honest without a reload
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  async function refresh() {
    if (!plant || refreshing) return
    setRefreshing(true)
    try {
      const pred = await api.predict(plant.id)
      setResult(pred.result)
      setField(await api.field(plant.id))
      setTrend(await api.trend(plant.id, trendDays))
      setLastUpdated(new Date())
    } catch {
      toast.error(t("farmer.home.refresh_error"))
    } finally {
      setRefreshing(false)
    }
  }

  async function changeBlockSize(size: number) {
    if (!plant) return
    setField(await api.field(plant.id, size))
  }

  async function changeTrendDays(days: 1 | 7) {
    if (!plant) return
    setTrendDays(days)
    setTrendLoading(true)
    try {
      setTrend(await api.trend(plant.id, days))
    } finally {
      setTrendLoading(false)
    }
  }

  function downloadTrendCsv() {
    if (!trend) return
    const rows = trend.points.map((p) => [
      p.timestamp, p.days_ago.toFixed(3), p.result.unknown ? "" : String(p.result.stressed),
      p.result.class_label ?? "", p.result.confidence_band ?? "", p.result.confidence_pct ?? "",
    ])
    const csv = [
      ["timestamp", "days_ago", "stressed", "class_label", "confidence_band", "confidence_pct"],
      ...rows,
    ].map((row) => row.join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${plant?.label ?? "block"}_trend_${trendDays}d.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const farmer = onboarding?.farmer
  const look = plantLook(result)
  const tierName = tenant ? t(`tier.${tenant.tier}` as TranslationKey) : ""

  const verdictBase = t(`farmer.verdict.${look.mood}` as TranslationKey)
  const verdict = look.uncertain && look.mood !== "unknown" ? t("farmer.verdict.might_be", { verdict: verdictBase }) : verdictBase
  const confidenceWord = result && !result.unknown && result.confidence_band
    ? t(
        result.confidence_band === "fairly sure"
          ? "farmer.home.confidence.fairly_sure"
          : result.confidence_band === "uncertain" ? "farmer.home.confidence.uncertain" : "farmer.home.confidence.not_sure",
      )
    : null
  const verdictColor = look.mood === "healthy"
    ? "text-leaf-700 dark:text-leaf-500"
    : look.mood === "unknown" ? "text-gray-500 dark:text-gray-400" : "text-stress-600"
  const showClassTimeline = result?.severity_timeline_available && result.severity && result.severity !== "none"
    && (look.mood === "drought" || look.mood === "heat" || look.mood === "salinity")
  const ratio = farmer?.plant_count && farmer.sensor_count
    ? Math.max(1, Math.round(farmer.plant_count / farmer.sensor_count))
    : null

  return (
    <div className="min-h-dvh ambient-leaf-bg">
      <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-center text-sm font-medium py-2 px-4 flex items-center justify-center gap-1.5">
        <WarningIcon className="w-4 h-4 shrink-0" /> {t("farmer.home.demo_banner")}
      </div>
      <TopBar showSettings />

      <main className="max-w-5xl mx-auto px-4 pb-16 space-y-6">
        {loading && (
          <div className="space-y-6">
            <CardSkeleton lines={6} />
            <CardSkeleton lines={3} />
          </div>
        )}

        {!loading && loadError && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl surface p-6 text-center text-stress-600 font-medium">{t("farmer.home.load_error")}</div>
        )}

        {cap && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-amber-800 dark:text-amber-200">
            {t("farmer.home.cap_notice", { requested: cap.requested, cap: cap.cap, tier: tierName })}
          </div>
        )}

        {!loading && result && (
          <section className="bg-white/90 dark:bg-gray-800/90 rounded-3xl surface p-4 sm:p-6 grid md:grid-cols-2 gap-4 md:gap-6 items-center animate-fade-in">
            <div className="relative">
              <PlantStage look={look} size="hero" label={verdict} />
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <span>{t("farmer.home.block", { label: blockName(plant?.label, t), count: plant?.covered_count ?? 0 })}</span>
                <button
                  onClick={refresh} disabled={refreshing}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-leaf-50 dark:bg-leaf-700/25 text-leaf-700 dark:text-leaf-500 font-semibold px-3 py-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshIcon className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> {t("farmer.home.refresh")}
                </button>
              </div>
              <h1 className={`font-display text-3xl sm:text-4xl font-semibold leading-tight ${verdictColor}`}>{verdict}</h1>
              <div className="flex flex-wrap items-center gap-2 text-gray-600 dark:text-gray-300">
                {confidenceWord && <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1">{confidenceWord}</span>}
                {result.confidence_pct != null && !result.unknown && (
                  <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1">{t("farmer.home.confidence.pct", { pct: result.confidence_pct })}</span>
                )}
                {lastUpdated && <span className="text-sm text-gray-400">{t("farmer.home.updated", { ago: timeAgo(lastUpdated, new Date(), t) })}</span>}
              </div>

              <Guide text={adviceFor(result, look, farmer?.watering_method, t)} mood={GUIDE_MOOD[look.mood]} />

              {showClassTimeline && (
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700/40 px-4 py-3 text-gray-700 dark:text-gray-200 space-y-1">
                  <p className="font-semibold">{t("severity.label", { severity: t(`severity.${result.severity}` as TranslationKey) })}</p>
                  <p>{t(`farmer.timeline.${look.mood}` as TranslationKey)}</p>
                </div>
              )}
              {!result.unknown && result.stressed && !result.diagnosis_remedy_available && (
                <p className="text-sm text-gray-500 dark:text-gray-400">⭐ {t("farmer.home.upgrade_for_remedy")}</p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t("farmer.home.general_guidance")}{" "}
                {t("farmer.home.alert_pref", {
                  pref: t(farmer?.alert_threshold === "tell_me_early" ? "farmer.home.alert_pref.tell_me_early" : "farmer.home.alert_pref.fairly_sure"),
                })}
              </p>
            </div>
          </section>
        )}

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {!loading && plant && (
            <section className="bg-white dark:bg-gray-800 rounded-3xl surface p-5 sm:p-6 animate-fade-in">
              <ActionPanel
                plantId={plant.id}
                method={farmer?.watering_method}
                suggestIrrigation={shouldSuggestIrrigation(look, !!result?.diagnosis_remedy_available)}
              />
            </section>
          )}

          {!loading && field && (
            <section className="bg-white dark:bg-gray-800 rounded-3xl surface p-5 sm:p-6 animate-fade-in space-y-3">
              <h2 className="font-display text-xl font-semibold text-gray-800 dark:text-gray-100">🌾 {t("farmer.home.field_map")}</h2>
              <FieldRows
                cells={field.cells} blockSize={field.block_size} onBlockSizeChange={changeBlockSize}
                maxBlockSize={Math.max(2000, (farmer?.plant_count ?? 500) * 2)}
              />
            </section>
          )}
        </div>

        {!loading && trend && (
          <section className="bg-white dark:bg-gray-800 rounded-3xl surface p-5 sm:p-6 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
              <h2 className="font-display text-xl font-semibold text-gray-800 dark:text-gray-100">📈 {t("farmer.home.trend")}</h2>
              <div className="flex items-center gap-2">
                <div className="flex rounded-xl border-2 border-gray-200 dark:border-gray-600 overflow-hidden">
                  {([1, 7] as const).map((d) => (
                    <button
                      key={d} onClick={() => changeTrendDays(d)}
                      className={`px-3 py-2 font-medium transition-colors cursor-pointer ${trendDays === d ? "bg-leaf-600 text-white" : "text-gray-600 dark:text-gray-300"}`}
                    >
                      {t(d === 1 ? "farmer.home.trend.day" : "farmer.home.trend.week")}
                    </button>
                  ))}
                </div>
                <button
                  onClick={downloadTrendCsv}
                  aria-label={t("farmer.home.download_csv")}
                  title={t("farmer.home.download_csv")}
                  className="p-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 cursor-pointer"
                >
                  <DownloadIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            {trendLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : tenant?.tier === "basic" ? (
              <TrendSummary points={trend.points} />
            ) : (
              <TrendChart points={trend.points} days={trendDays} />
            )}
          </section>
        )}

        {!loading && farmer && (
          <section className="bg-white/70 dark:bg-gray-800/70 rounded-3xl surface p-5 grid sm:grid-cols-2 gap-3 text-gray-700 dark:text-gray-200">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">{t("farmer.home.coverage")}</p>
              {ratio && <p className="text-lg font-semibold">📡 {t("farmer.q3.ratio", { n: ratio })}</p>}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 sm:text-right">
              {t("farmer.home.irrigation_label", { method: t(`farmer.q5.${farmer.watering_method}` as TranslationKey) })}
              {" · "}
              {t(`farmer.home.salinity.${farmer.salinity_history}` as TranslationKey)}
              {farmer.region ? ` · ${farmer.region}` : ""}
            </p>
          </section>
        )}

        {!loading && tenant && (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500">
            {t("farmer.home.tier_footer", { tier: tierName })}
            {tenant.tier === "basic" ? ` · ${t("farmer.home.tier_upsell")}` : ""}
          </p>
        )}
      </main>
    </div>
  )
}
