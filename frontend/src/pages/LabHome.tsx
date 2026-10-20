import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ApiError, api, type OnboardingOut, type PlantOut } from "../api/client"
import { useAuth } from "../state/auth"

interface PredictResult {
  stressed: boolean
  class_label: string | null
  confidence_pct: number | null
  full_probability_vector?: Record<string, number>
  shap_available: boolean
}

/**
 * Lab wording per section 5's vocabulary table: exact, numeric, jargon-forward
 * ("Predicted class: drought (p = 0.74, calibrated)") — never the farmer's plain-language
 * copy. Full waveform viewer + confound panel land in step 6; this proves the fork already
 * drives different behavior from what onboarding actually captured.
 */
export default function LabHome() {
  const { tenant } = useAuth()
  const [onboarding, setOnboarding] = useState<OnboardingOut | null>(null)
  const [plant, setPlant] = useState<PlantOut | null>(null)
  const [result, setResult] = useState<PredictResult | null>(null)
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
          setResult(pred.result as unknown as PredictResult)
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
            <p className="text-sm text-gray-400">{plant?.label ?? "Replicate 1"} · model v. current</p>
            <h2 className="text-xl font-mono">
              Predicted class: <span className="font-semibold">{result.class_label ?? "n/a"}</span>
              {result.confidence_pct != null && <> (p = {(result.confidence_pct / 100).toFixed(2)}, calibrated)</>}
            </h2>
            <p className="text-sm text-gray-500">stressed = {String(result.stressed)}</p>

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

            <p className="text-xs text-gray-400">
              SHAP explanations: {result.shap_available ? "available (Pro)" : "not available on this tier"}
            </p>
          </div>
        )}

        {lab?.has_ground_truth_assay && (
          <p className="text-xs text-gray-400">
            Ground-truth assay data flagged as available — CSV upload + supervised
            recalibration wiring lands with the lab view (step 6).
          </p>
        )}

        <p className="text-center text-xs text-gray-400">Tier: {tenant?.tier}</p>
      </main>
    </div>
  )
}
