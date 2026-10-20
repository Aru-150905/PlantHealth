import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, type FarmerProfile } from "../../api/client"
import { SUPPORTED_LOCALES, useT } from "../../i18n"
import { useAuth } from "../../state/auth"

const DEFAULTS: FarmerProfile = {
  crop: "tomato",
  plant_count: 500,
  sensor_count: 5,
  field_layout: { kind: "rows", rows: 10, spacing_m: 1.0 },
  watering_method: "drip",
  salinity_history: "unsure",
  region: "",
  season: "",
  alert_threshold: "fairly_sure",
  language: "en",
}

const TOTAL_STEPS = 9

/** Large, one-tap choice buttons — "large touch targets," per the brief, for someone
 * standing in a field on a phone. */
function ChoiceGrid<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string; emoji?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-xl py-6 px-4 text-lg font-medium border-2 transition ${
            value === opt.value
              ? "border-leaf-600 bg-leaf-50 text-leaf-700"
              : "border-gray-200 text-gray-700 hover:border-gray-300"
          }`}
        >
          {opt.emoji && <span className="block text-2xl mb-1">{opt.emoji}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function FarmerOnboarding() {
  const { t } = useT()
  const { refreshTenant } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState<FarmerProfile>(DEFAULTS)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof FarmerProfile>(key: K, value: FarmerProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }))

  const coveragePreview = useMemo(() => {
    if (!profile.plant_count || !profile.sensor_count) return null
    const ratio = Math.max(1, Math.round(profile.plant_count / profile.sensor_count))
    return `1 sensor per ${ratio} plants`
  }, [profile.plant_count, profile.sensor_count])

  async function finish() {
    setSaving(true)
    try {
      await api.submitFarmerOnboarding(profile)
      await refreshTenant()
      navigate("/farmer")
    } finally {
      setSaving(false)
    }
  }

  function next() {
    if (step === TOTAL_STEPS - 1) {
      finish()
    } else {
      setStep((s) => s + 1)
    }
  }

  const steps = [
    // 1. crop
    <div key="crop" className="space-y-6">
      <h2 className="text-xl font-semibold">{t("farmer.q1.title")}</h2>
      <ChoiceGrid
        value={profile.crop}
        onChange={(v) => set("crop", v)}
        options={[
          { value: "tomato", label: "Tomato", emoji: "🍅" },
          { value: "other", label: "Other crop", emoji: "🌾" },
        ]}
      />
      {profile.crop === "other" && (
        <p className="text-sm text-gray-500">
          Only tomato is fully supported by the model today — the schema is open for other
          crops, but predictions for this crop should be treated as unvalidated.
        </p>
      )}
    </div>,

    // 2. plant count
    <div key="count" className="space-y-6">
      <h2 className="text-xl font-semibold">{t("farmer.q2.title")}</h2>
      <input
        type="range" min={10} max={5000} step={10}
        value={profile.plant_count ?? 500}
        onChange={(e) => set("plant_count", Number(e.target.value))}
        className="w-full accent-leaf-600"
      />
      <div className="text-center text-3xl font-semibold text-leaf-700">{profile.plant_count}</div>
      <input
        type="number" value={profile.plant_count ?? ""}
        onChange={(e) => set("plant_count", e.target.value ? Number(e.target.value) : null)}
        placeholder="or type an exact number"
        className="w-full rounded-lg border border-gray-300 px-3 py-3 text-center text-lg"
      />
    </div>,

    // 3. sensor count -> coverage ratio shown immediately
    <div key="sensors" className="space-y-6">
      <h2 className="text-xl font-semibold">{t("farmer.q3.title")}</h2>
      <input
        type="number" min={1} value={profile.sensor_count}
        onChange={(e) => set("sensor_count", Math.max(1, Number(e.target.value)))}
        className="w-full rounded-lg border border-gray-300 px-3 py-3 text-center text-2xl font-semibold"
      />
      {coveragePreview && (
        <div className="rounded-xl bg-leaf-50 border border-leaf-100 py-4 px-4 text-center">
          <p className="text-leaf-700 font-medium">{t("farmer.q3.coverage", { ratio: coveragePreview })}</p>
        </div>
      )}
    </div>,

    // 4. field layout
    <div key="layout" className="space-y-6">
      <h2 className="text-xl font-semibold">{t("farmer.q4.title")}</h2>
      <ChoiceGrid
        value={profile.field_layout.kind}
        onChange={(v) => set("field_layout", { ...profile.field_layout, kind: v })}
        options={[
          { value: "rows", label: t("farmer.q4.rows") },
          { value: "grid", label: t("farmer.q4.grid") },
          { value: "rough", label: t("farmer.q4.rough") },
        ]}
      />
      {profile.field_layout.kind === "rows" && (
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number" placeholder="rows" value={profile.field_layout.rows ?? ""}
            onChange={(e) => set("field_layout", { ...profile.field_layout, rows: Number(e.target.value) })}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
          <input
            type="number" placeholder="spacing (m)" value={profile.field_layout.spacing_m ?? ""}
            onChange={(e) => set("field_layout", { ...profile.field_layout, spacing_m: Number(e.target.value) })}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
      )}
    </div>,

    // 5. watering
    <div key="watering" className="space-y-6">
      <h2 className="text-xl font-semibold">{t("farmer.q5.title")}</h2>
      <ChoiceGrid
        value={profile.watering_method}
        onChange={(v) => set("watering_method", v)}
        options={[
          { value: "drip", label: t("farmer.q5.drip"), emoji: "💧" },
          { value: "flood", label: t("farmer.q5.flood"), emoji: "🌊" },
          { value: "sprinkler", label: t("farmer.q5.sprinkler"), emoji: "💦" },
          { value: "rain_fed", label: t("farmer.q5.rain_fed"), emoji: "🌧️" },
        ]}
      />
    </div>,

    // 6. salinity history
    <div key="salinity" className="space-y-6">
      <h2 className="text-xl font-semibold">{t("farmer.q6.title")}</h2>
      <ChoiceGrid
        value={profile.salinity_history}
        onChange={(v) => set("salinity_history", v)}
        options={[
          { value: "yes", label: t("farmer.q6.yes") },
          { value: "no", label: t("farmer.q6.no") },
          { value: "unsure", label: t("farmer.q6.unsure") },
        ]}
      />
    </div>,

    // 7. location
    <div key="location" className="space-y-6">
      <h2 className="text-xl font-semibold">{t("farmer.q7.title")}</h2>
      <input
        placeholder={t("farmer.q7.region")} value={profile.region ?? ""}
        onChange={(e) => set("region", e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-3 text-lg"
      />
      <input
        placeholder={t("farmer.q7.season")} value={profile.season ?? ""}
        onChange={(e) => set("season", e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-3 text-lg"
      />
    </div>,

    // 8. alert threshold
    <div key="alerts" className="space-y-6">
      <h2 className="text-xl font-semibold">{t("farmer.q8.title")}</h2>
      <ChoiceGrid
        value={profile.alert_threshold}
        onChange={(v) => set("alert_threshold", v)}
        options={[
          { value: "fairly_sure", label: t("farmer.q8.fairly_sure") },
          { value: "tell_me_early", label: t("farmer.q8.tell_me_early") },
        ]}
      />
    </div>,

    // 9. language
    <div key="language" className="space-y-6">
      <h2 className="text-xl font-semibold">{t("farmer.q9.title")}</h2>
      <ChoiceGrid
        value={profile.language}
        onChange={(v) => set("language", v)}
        options={SUPPORTED_LOCALES.map((l) => ({ value: l.code, label: l.label }))}
      />
    </div>,
  ]

  return (
    <div className="min-h-dvh bg-leaf-50 flex flex-col">
      <div className="h-1.5 bg-leaf-100">
        <div
          className="h-full bg-leaf-600 transition-all"
          style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
        />
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-8 space-y-8">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {t("onboarding.step", { current: step + 1, total: TOTAL_STEPS })}
          </p>
          {steps[step]}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => (step === 0 ? undefined : setStep((s) => s - 1))}
              disabled={step === 0}
              className="text-gray-400 disabled:opacity-0 text-sm font-medium"
            >
              ← {t("onboarding.back")}
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={next} className="text-sm text-gray-400 font-medium">
                {t("onboarding.skip")}
              </button>
              <button
                type="button" onClick={next} disabled={saving}
                className="rounded-lg bg-leaf-600 hover:bg-leaf-700 text-white font-medium px-6 py-2.5 disabled:opacity-60"
              >
                {step === TOTAL_STEPS - 1 ? t("onboarding.finish") : t("onboarding.next")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
