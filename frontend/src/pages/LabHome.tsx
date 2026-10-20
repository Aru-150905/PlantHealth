import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  ApiError, api, type ConfoundPanelOut, type ExplainOut, type FeaturesOut,
  type OnboardingOut, type PlantOut, type PredictionResult,
} from "../api/client"
import ConfoundPanelComponent from "../components/ConfoundPanel"
import FeatureTable from "../components/FeatureTable"
import ShapPanel from "../components/ShapPanel"
import WaveformViewer from "../components/WaveformViewer"
import { useAuth } from "../state/auth"

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <div>
        <p className="font-medium text-gray-800">{title}</p>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
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
 */
export default function LabHome() {
  const { tenant } = useAuth()
  const [onboarding, setOnboarding] = useState<OnboardingOut | null>(null)
  const [plant, setPlant] = useState<PlantOut | null>(null)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [features, setFeatures] = useState<FeaturesOut["features"] | null>(null)
  const [explain, setExplain] = useState<ExplainOut | null>(null)
  const [explainError, setExplainError] = useState<string | null>(null)
  const [confound, setConfound] = useState<ConfoundPanelOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // see FarmerHome.tsx for why this guard exists — StrictMode double-invoke + real POSTs
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
            setExplainError(err instanceof ApiError ? (err.detail as { message?: string })?.message ?? String(err.detail) : null)
          }
        }
        try {
          setConfound(await api.confoundPanel())
        } catch {
          // non-critical panel — don't fail the whole page load over it
        }
      } catch (err) {
        setLoadError(err instanceof ApiError ? String(err.detail) : "Something went wrong loading this replicate.")
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lab = onboarding?.lab
  const canExport = result?.raw_export && result.raw_export !== "none"

  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="bg-amber-100 text-amber-900 text-center text-sm font-medium py-2 px-4">
        ⚠️ DEMO DATA — not from a real plant
      </div>

      <header className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto">
        <h1 className="text-lg font-semibold text-gray-800">PlantHealth · Lab</h1>
        <Link to="/settings" className="text-sm text-gray-500">⚙️ Settings</Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 pb-16 space-y-6">
        {lab && (
          <div className="bg-white rounded-xl shadow-sm p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-400 text-xs">Species</p><p className="font-medium">{lab.species}</p></div>
            <div><p className="text-gray-400 text-xs">Treatment arms</p><p className="font-medium">{lab.n_treatment_arms ?? "—"}</p></div>
            <div><p className="text-gray-400 text-xs">Replicates/arm</p><p className="font-medium">{lab.replicates_per_arm ?? "—"}</p></div>
            <div><p className="text-gray-400 text-xs">Sampling rate</p><p className="font-medium">{lab.sampling_rate_hz} Hz</p></div>
            <div><p className="text-gray-400 text-xs">Chamber</p><p className="font-medium">{lab.chamber_type.replace("_", " ")}</p></div>
            <div><p className="text-gray-400 text-xs">Light cycle</p><p className="font-medium">{lab.light_hours_on}h / {lab.light_hours_off}h</p></div>
            <div><p className="text-gray-400 text-xs">Validation</p><p className="font-medium">leave-one-plant-out{lab.show_random_split_comparison ? " + random-split demo" : ""}</p></div>
            <div><p className="text-gray-400 text-xs">Confound panel</p><p className={`font-medium ${onboarding?.confound_panel_enabled ? "text-amber-700" : "text-gray-400"}`}>{onboarding?.confound_panel_enabled ? "enabled (incubator)" : "disabled"}</p></div>
          </div>
        )}

        {loading && <p className="text-center text-gray-400 py-12">Loading…</p>}

        {!loading && loadError && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center text-red-600">{loadError}</div>
        )}

        {!loading && result && (
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-400">{plant?.label ?? "Replicate 1"} · model v. current</p>
                <h2 className="text-xl font-mono">
                  {result.unknown ? (
                    <>Predicted class: <span className="font-semibold">unknown</span> — {result.unknown_reason}</>
                  ) : (
                    <>Predicted class: <span className="font-semibold">{result.class_label ?? "n/a"}</span>
                    {result.confidence_pct != null && <> (p = {(result.confidence_pct / 100).toFixed(2)}, calibrated)</>}</>
                  )}
                </h2>
                <p className="text-sm text-gray-500">stressed = {result.stressed === null ? "n/a" : String(result.stressed)}</p>
              </div>
              {canExport && plant && (
                <a
                  href={api.exportCsvUrl(plant.id, 30)} download
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 shrink-0"
                >
                  ⤓ Export CSV
                </a>
              )}
            </div>

            {result.full_probability_vector && (
              <div className="pt-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Full probability vector</p>
                <div className="flex gap-4 font-mono text-sm">
                  {Object.entries(result.full_probability_vector).map(([k, v]) => (
                    <span key={k}>{k}: {v.toFixed(4)}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && plant && (
          <Card title="Signal" subtitle="Time domain, frequency domain, pan and zoom — environmental channels on the same time axis below">
            <WaveformViewer plantId={plant.id} />
          </Card>
        )}

        {!loading && features && (
          <Card title="Computed features" subtitle="This window's feature vector, as fed to the model">
            <FeatureTable features={features} />
          </Card>
        )}

        {!loading && (explain || explainError) && (
          <Card title="SHAP explanation" subtitle="Which features drove this prediction">
            {explain ? (
              <ShapPanel classLabel={explain.class_label} features={explain.top_features} />
            ) : (
              <p className="text-sm text-gray-400">{explainError} Upgrade to Pro to see this.</p>
            )}
          </Card>
        )}

        {!loading && confound && (
          <Card title="Confound panel" subtitle="Chamber temperature against predicted class">
            <ConfoundPanelComponent panel={confound} />
          </Card>
        )}

        {lab?.has_ground_truth_assay && (
          <p className="text-xs text-gray-400">
            Ground-truth assay data flagged as available — upload wiring for supervised
            recalibration against it is not yet built.
          </p>
        )}

        <p className="text-center text-xs text-gray-400">Tier: {tenant?.tier}</p>
      </main>
    </div>
  )
}
