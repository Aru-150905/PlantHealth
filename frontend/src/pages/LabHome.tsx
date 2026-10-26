import { useEffect, useRef, useState } from "react"

type LabTab = "signal" | "features" | "explain" | "confounds" | "data"
const TABS: { id: LabTab; label: string }[] = [
  { id: "signal", label: "Signal" },
  { id: "features", label: "Features" },
  { id: "explain", label: "Explain (SHAP)" },
  { id: "confounds", label: "Confounds" },
  { id: "data", label: "Data & calibration" },
]

function readTab(): LabTab {
  const h = window.location.hash.slice(1)
  return TABS.some((t) => t.id === h) ? (h as LabTab) : "signal"
}
import {
  ApiError, api, errorMessage, type ConfoundPanelOut, type ExplainOut, type FeaturesOut,
  type OnboardingOut, type PlantOut, type PredictionResult,
} from "../api/client"
import ConfoundPanelComponent from "../components/ConfoundPanel"
import FeatureTable from "../components/FeatureTable"
import GroundTruthUploader from "../components/GroundTruthUploader"
import ShapPanel from "../components/ShapPanel"
import WaveformViewer from "../components/WaveformViewer"
import { CardSkeleton } from "../components/ui/Skeleton"
import { useToast } from "../components/ui/Toast"
import { RefreshIcon, WarningIcon } from "../components/ui/Icon"
import Explainer from "../components/ui/Explainer"
import TopBar from "../components/ui/TopBar"
import PlantStage from "../components/plant/PlantStage"
import { plantLook } from "../lib/plantLook"
import { useAuth } from "../state/auth"

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl surface p-5 space-y-3 animate-fade-in">
      <div>
        <p className="font-medium text-gray-800 dark:text-gray-100">{title}</p>
        {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

/**
 * Lab wording per section 5's vocabulary table: exact, numeric, jargon-forward
 * ("Predicted class: drought (p = 0.74, calibrated)") — never the farmer's plain-language
 * copy. The full section-7 feature set: waveform viewer (time + frequency domain, pan/
 * zoom), the feature table, SHAP (Pro), environmental overlay, raw CSV export, and the
 * confound panel.
 *
 * Owner's 2026-10-26 ask: "not as beginner friendly as the farmer, but slightly less dense".
 * So nothing is removed; the verdict (with the same 3D plant) stays on top, the deep panels
 * move into tabs (state in the URL hash), and each technical term gets a "?" explainer.
 */
export default function LabHome() {
  const { tenant } = useAuth()
  const toast = useToast()
  const [onboarding, setOnboarding] = useState<OnboardingOut | null>(null)
  const [plant, setPlant] = useState<PlantOut | null>(null)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [features, setFeatures] = useState<FeaturesOut["features"] | null>(null)
  const [explain, setExplain] = useState<ExplainOut | null>(null)
  const [explainError, setExplainError] = useState<string | null>(null)
  const [confound, setConfound] = useState<ConfoundPanelOut | null>(null)
  const [calibrationUrl, setCalibrationUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // see FarmerHome.tsx for why this guard exists — StrictMode double-invoke + real POSTs
  const didInit = useRef(false)
  const [tab, setTabState] = useState<LabTab>(readTab)
  function setTab(next: LabTab) {
    setTabState(next)
    window.history.replaceState(null, "", `#${next}`)
  }

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
          first = await api.createPlant({ label: "Replicate 1", device_id: devices[0]?.id ?? null, covered_count: 1 })
        }
        setPlant(first)
        if (first) {
          const pred = await api.predict(first.id)
          setResult(pred.result)
          const f = await api.features(first.id)
          setFeatures(f.features)
          try {
            setExplain(await api.explain(first.id))
          } catch (err) {
            setExplainError(err instanceof ApiError ? errorMessage(err) : null)
          }
          if (pred.result.full_probability_vector) {
            // Pro tier only (same gate the backend enforces) — fetched as an authenticated
            // blob, not a plain <img src>, which can't carry the Authorization header
            try {
              setCalibrationUrl(await api.calibrationCurveBlobUrl())
            } catch {
              // non-critical — the card just won't render
            }
          }
        }
        try {
          setConfound(await api.confoundPanel())
        } catch {
          // non-critical panel — don't fail the whole page load over it
        }
      } catch (err) {
        setLoadError(errorMessage(err, "Something went wrong loading this replicate."))
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (calibrationUrl) URL.revokeObjectURL(calibrationUrl)
    }
  }, [calibrationUrl])

  const lab = onboarding?.lab
  const canExport = result?.raw_export && result.raw_export !== "none"

  async function refresh() {
    if (!plant || refreshing) return
    setRefreshing(true)
    try {
      const pred = await api.predict(plant.id)
      setResult(pred.result)
      const f = await api.features(plant.id)
      setFeatures(f.features)
    } catch {
      toast.error("Couldn't refresh — check your connection and try again.")
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900">
      <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-center text-sm font-medium py-2 px-4 flex items-center justify-center gap-1.5">
        <WarningIcon className="w-4 h-4 shrink-0" /> DEMO DATA — not from a real plant
      </div>
      <TopBar showSettings title="PlantHealth · Lab" />

      <main className="max-w-5xl mx-auto px-4 pb-16 space-y-6">
        {lab && (
          <details className="bg-white dark:bg-gray-800 rounded-2xl surface px-5 py-4 animate-fade-in" open>
            <summary className="font-medium text-gray-800 dark:text-gray-100 cursor-pointer">Experiment setup</summary>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mt-3">
              <div><p className="text-gray-400 dark:text-gray-500 text-xs">Species</p><p className="font-medium text-gray-900 dark:text-gray-100">{lab.species}</p></div>
              <div><p className="text-gray-400 dark:text-gray-500 text-xs">Treatment arms</p><p className="font-medium text-gray-900 dark:text-gray-100">{lab.n_treatment_arms ?? "—"}</p></div>
              <div><p className="text-gray-400 dark:text-gray-500 text-xs">Replicates/arm</p><p className="font-medium text-gray-900 dark:text-gray-100">{lab.replicates_per_arm ?? "—"}</p></div>
              <div><p className="text-gray-400 dark:text-gray-500 text-xs">Sampling rate</p><p className="font-medium text-gray-900 dark:text-gray-100">{lab.sampling_rate_hz} Hz</p></div>
              <div><p className="text-gray-400 dark:text-gray-500 text-xs">Chamber</p><p className="font-medium text-gray-900 dark:text-gray-100">{lab.chamber_type.replace("_", " ")}</p></div>
              <div><p className="text-gray-400 dark:text-gray-500 text-xs">Light cycle</p><p className="font-medium text-gray-900 dark:text-gray-100">{lab.light_hours_on}h / {lab.light_hours_off}h</p></div>
              <div>
                <p className="text-gray-400 dark:text-gray-500 text-xs">
                  Validation
                  <Explainer term="Leave-one-plant-out">Each test uses a plant the model never saw in training, so windows from the same plant can't leak the answer. It gives a lower, honest accuracy (81.1% here vs. 89.2% for a naive random split).</Explainer>
                </p>
                <p className="font-medium text-gray-900 dark:text-gray-100">leave-one-plant-out{lab.show_random_split_comparison ? " + random-split demo" : ""}</p>
              </div>
              <div><p className="text-gray-400 dark:text-gray-500 text-xs">Confound panel</p><p className={`font-medium ${onboarding?.confound_panel_enabled ? "text-amber-700 dark:text-amber-400" : "text-gray-400 dark:text-gray-500"}`}>{onboarding?.confound_panel_enabled ? "enabled (incubator)" : "disabled"}</p></div>
            </div>
          </details>
        )}

        {loading && (
          <div className="space-y-6">
            <CardSkeleton lines={4} />
            <CardSkeleton lines={3} />
          </div>
        )}

        {!loading && loadError && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl surface p-6 text-center text-stress-600">{loadError}</div>
        )}

        {!loading && result && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl surface p-5 sm:p-6 grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-center animate-fade-in">
            <PlantStage look={plantLook(result)} size="card" label={result.class_label ?? "unknown"} />
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <span>{plant?.label ?? "Replicate 1"} · model v. current</span>
                <button
                  onClick={refresh} disabled={refreshing}
                  aria-label="Refresh reading"
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <RefreshIcon className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                </button>
                {canExport && plant && (
                  <a
                    href={api.exportCsvUrl(plant.id, 30)} download
                    className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 shrink-0 transition-colors"
                  >
                    ⤓ Export CSV
                  </a>
                )}
              </div>
              <h2 className="text-xl font-mono text-gray-900 dark:text-gray-100">
                {result.unknown ? (
                  <>Predicted class: <span className="font-semibold">unknown</span> — {result.unknown_reason}</>
                ) : (
                  <>Predicted class: <span className="font-semibold">{result.class_label ?? "n/a"}</span>
                  {result.confidence_pct != null && <> (p = {(result.confidence_pct / 100).toFixed(2)}, calibrated)</>}</>
                )}
                <Explainer term="Calibrated p">The model's probability after calibration on out-of-fold predictions, so that "0.74" means right about 74% of the time — not just a raw score.</Explainer>
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">stressed = {result.stressed === null ? "n/a" : String(result.stressed)}</p>

              {result.full_probability_vector && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Full probability vector</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm text-gray-800 dark:text-gray-200">
                    {Object.entries(result.full_probability_vector).map(([k, v]) => (
                      <span key={k}>{k}: {v.toFixed(4)}</span>
                    ))}
                  </div>
                </div>
              )}

              {result.severity_timeline_available && result.severity && result.severity !== "none" && (
                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                  severity = {result.severity} · timeline = {result.estimated_timeline}
                </p>
              )}
            </div>
          </section>
        )}

        {!loading && plant && (
          <section className="space-y-4">
            <div role="tablist" aria-label="Lab panels" className="flex gap-1 overflow-x-auto rounded-2xl bg-white dark:bg-gray-800 surface p-1">
              {TABS.map((tb) => (
                <button
                  key={tb.id} role="tab" aria-selected={tab === tb.id} onClick={() => setTab(tb.id)}
                  className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium cursor-pointer transition-colors ${
                    tab === tb.id ? "bg-leaf-600 text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {tb.label}
                </button>
              ))}
            </div>

            {tab === "signal" && (
              <Card title="Signal" subtitle="Time domain, frequency domain, pan and zoom — environmental channels on the same time axis below">
                <WaveformViewer plantId={plant.id} />
              </Card>
            )}

            {tab === "features" && features && (
              <Card title="Computed features" subtitle="This window's feature vector, as fed to the model">
                <p className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Hjorth mobility / complexity<Explainer term="Hjorth parameters">Mobility is roughly the signal's mean frequency; complexity is how much that frequency changes — a measure of how "busy" the waveform is.</Explainer></span>
                  <span>Crest factor<Explainer term="Crest factor">Peak value divided by RMS: high when a window has sharp spikes (e.g. heat variation potentials).</Explainer></span>
                  <span>Wavelet packet energy<Explainer term="Wavelet packet energy">How much of the signal's energy sits in each frequency band, so slow drought drift and fast heat spikes separate.</Explainer></span>
                </p>
                <FeatureTable features={features} />
              </Card>
            )}

            {tab === "explain" && (
              <Card title="SHAP explanation" subtitle="Which features drove this prediction">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  What is this?<Explainer term="SHAP">Each feature's push toward or away from the predicted class for this window. Bigger bars mattered more.</Explainer>
                </p>
                {explain ? (
                  <ShapPanel classLabel={explain.class_label} features={explain.top_features} />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500">{explainError ?? "Not available."} Upgrade to Pro to see this.</p>
                )}
              </Card>
            )}

            {tab === "confounds" && (
              <Card title="Confound panel" subtitle="Chamber temperature against predicted class">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Why this matters<Explainer term="Confound">Something other than the plant's stress that changes with the treatment — here the incubator compressor, which cycles harder for some setpoints and can make the model learn the chamber instead of the plant.</Explainer>
                </p>
                {confound ? <ConfoundPanelComponent panel={confound} /> : <p className="text-sm text-gray-400">Not available for this account.</p>}
              </Card>
            )}

            {tab === "data" && (
              <div className="space-y-6">
                {/* full_probability_vector is only present at the exact_pct_plus_calibration_curve
                    tier (Pro) — same gate the calibration curve endpoint itself enforces server-side */}
                {result?.full_probability_vector && calibrationUrl && (
                  <Card title="Calibration curve" subtitle="Reliability diagram over leave-one-plant-out out-of-fold predictions">
                    <img src={calibrationUrl} alt="Calibration reliability curve" className="w-full rounded-lg border border-gray-100 dark:border-gray-700" />
                  </Card>
                )}
                {lab ? (
                  <Card title="Ground-truth assay data" subtitle="RWC / proline / MDA / chlorophyll, with timepoints">
                    <GroundTruthUploader />
                  </Card>
                ) : (
                  <p className="text-sm text-gray-400">No lab profile yet.</p>
                )}
              </div>
            )}
          </section>
        )}

        <p className="text-center text-xs text-gray-400 dark:text-gray-600">Tier: {tenant?.tier}</p>
      </main>
    </div>
  )
}
