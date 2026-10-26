import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { api, type FarmerProfile } from "../../api/client"
import Guide from "../../components/guide/Guide"
import type { GuideMood } from "../../components/guide/GuideAvatar"
import Stepper from "../../components/ui/Stepper"
import TopBar from "../../components/ui/TopBar"
import { useToast } from "../../components/ui/Toast"
import { SUPPORTED_LOCALES, useT } from "../../i18n"
import type { TranslationKey } from "../../i18n/en"
import { REGIONS, SEASONS } from "../../lib/regions"
import { useAuth } from "../../state/auth"

const TOTAL_STEPS = 9

/**
 * Farmer setup (section 5's nine questions), rebuilt for someone who may not read well:
 * the helper asks each question (and can read it aloud), every choice is a big picture
 * tile, numbers are − / + steppers instead of empty boxes, and state/season are pick lists.
 * The questions and the stored profile are unchanged from before.
 */

/** Large pressable picture tiles — one tap, no typing. */
function ChoiceGrid<T extends string>({
  options, value, onChange, cols = 2,
}: {
  options: { value: T; label: string; picture?: ReactNode }[]
  value: T
  onChange: (v: T) => void
  cols?: 2 | 3
}) {
  return (
    <div className={`grid gap-3 ${cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={`btn-3d relative rounded-2xl py-4 px-2 text-base sm:text-lg font-semibold border-4 cursor-pointer flex flex-col items-center gap-1.5 ${
              selected
                ? "border-leaf-600 bg-leaf-50 dark:bg-leaf-700/25 text-leaf-800 dark:text-leaf-500"
                : "border-transparent bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
            }`}
          >
            {opt.picture && <span className="text-4xl leading-none h-12 flex items-center" aria-hidden>{opt.picture}</span>}
            <span className="leading-tight text-center">{opt.label}</span>
            {selected && (
              <span className="absolute top-1.5 right-2 text-leaf-600 text-lg" aria-hidden>✓</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

const dot = (cx: number, cy: number, k: string) => <circle key={k} cx={cx} cy={cy} r="3.2" fill="#3f9142" />
const LAYOUT_PICTURES = {
  rows: (
    <svg viewBox="0 0 48 40" className="w-14 h-12">
      {[8, 20, 32].flatMap((y) => [6, 16, 26, 36, 44].map((x) => dot(x, y, `${x}-${y}`)))}
      {[8, 20, 32].map((y) => <line key={y} x1="2" x2="46" y1={y + 5} y2={y + 5} stroke="#8a6a45" strokeWidth="1.2" />)}
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 48 40" className="w-14 h-12">
      <rect x="2" y="2" width="44" height="36" fill="none" stroke="#8a6a45" strokeWidth="1.2" />
      {[10, 20, 30].flatMap((y) => [10, 20, 30, 40].map((x) => dot(x, y, `${x}-${y}`)))}
    </svg>
  ),
  rough: (
    <svg viewBox="0 0 48 40" className="w-14 h-12">
      <path d="M4 30 Q10 6 24 10 Q42 14 44 30 Q30 38 4 30Z" fill="none" stroke="#8a6a45" strokeWidth="1.2" strokeDasharray="3 2" />
      {[[14, 22], [22, 17], [30, 24], [36, 20], [20, 28]].map(([x, y]) => dot(x, y, `${x}-${y}`))}
    </svg>
  ),
}

const STEP_GUIDE: TranslationKey[] = [
  "guide.q1", "guide.q2", "guide.q3", "guide.q4", "guide.q5", "guide.q6", "guide.q7", "guide.q8", "guide.q9",
]

export default function FarmerOnboarding() {
  const { t, locale, setLocale } = useT()
  const { refreshTenant } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [guideMood, setGuideMood] = useState<GuideMood>("point")
  const [profile, setProfile] = useState<FarmerProfile>(() => ({
    crop: "tomato",
    plant_count: 500,
    sensor_count: 5,
    field_layout: { kind: "rows", rows: 10, spacing_m: 1.0 },
    watering_method: "drip",
    salinity_history: "unsure",
    region: "",
    season: "",
    alert_threshold: "fairly_sure",
    // the language already chosen at the top of the screen — finishing setup must not
    // silently switch it back to English (the backend saves this as the account language)
    language: locale,
  }))

  const set = <K extends keyof FarmerProfile>(key: K, value: FarmerProfile[K]) => {
    setProfile((p) => ({ ...p, [key]: value }))
    setGuideMood("nod")
  }

  const ratio = profile.plant_count && profile.sensor_count
    ? Math.max(1, Math.round(profile.plant_count / profile.sensor_count))
    : null

  async function finish() {
    setSaving(true)
    try {
      await api.submitFarmerOnboarding({ ...profile, language: locale })
      await refreshTenant()
      navigate("/farmer")
    } catch {
      toast.error(t("auth.generic_error"))
    } finally {
      setSaving(false)
    }
  }

  function goTo(next: number) {
    setStep(next)
    setGuideMood("point")
  }

  function next() {
    if (step === TOTAL_STEPS - 1) finish()
    else goTo(step + 1)
  }

  const title = "font-display text-2xl font-semibold text-gray-900 dark:text-gray-100"
  const layout = profile.field_layout

  const steps = [
    // 1. crop
    <div key="crop" className="space-y-5">
      <h2 className={title}>{t("farmer.q1.title")}</h2>
      <ChoiceGrid
        value={profile.crop}
        onChange={(v) => set("crop", v)}
        options={[
          { value: "tomato", label: t("farmer.q1.tomato"), picture: "🍅" },
          { value: "other", label: t("farmer.q1.other"), picture: "🌾" },
        ]}
      />
      {profile.crop === "other" && (
        <p className="rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 px-4 py-3">{t("farmer.q1.other_warning")}</p>
      )}
    </div>,

    // 2. plant count
    <div key="count" className="space-y-5">
      <h2 className={title}>{t("farmer.q2.title")}</h2>
      <p className="text-5xl text-center" aria-hidden>🌱🌱🌱</p>
      <Stepper value={profile.plant_count ?? 500} onChange={(v) => set("plant_count", v)} min={10} max={100000} step={10} unit={t("farmer.q2.unit")} />
    </div>,

    // 3. sensor count -> coverage ratio shown immediately (the sentinel idea, minute one)
    <div key="sensors" className="space-y-5">
      <h2 className={title}>{t("farmer.q3.title")}</h2>
      <p className="text-5xl text-center" aria-hidden>📡</p>
      <Stepper value={profile.sensor_count} onChange={(v) => set("sensor_count", v)} min={1} max={1000} unit={t("farmer.q3.unit")} />
      {ratio && (
        <div className="rounded-2xl bg-leaf-50 dark:bg-leaf-700/20 border-2 border-leaf-100 dark:border-leaf-600/40 py-4 px-4 text-center">
          <p className="text-lg text-leaf-700 dark:text-leaf-500 font-semibold">
            {t("farmer.q3.coverage", { ratio: t("farmer.q3.ratio", { n: ratio }) })}
          </p>
        </div>
      )}
    </div>,

    // 4. field layout
    <div key="layout" className="space-y-5">
      <h2 className={title}>{t("farmer.q4.title")}</h2>
      <ChoiceGrid
        cols={3}
        value={layout.kind}
        onChange={(v) => set("field_layout", { ...layout, kind: v })}
        options={[
          { value: "rows", label: t("farmer.q4.rows"), picture: LAYOUT_PICTURES.rows },
          { value: "grid", label: t("farmer.q4.grid"), picture: LAYOUT_PICTURES.grid },
          { value: "rough", label: t("farmer.q4.rough"), picture: LAYOUT_PICTURES.rough },
        ]}
      />
      {layout.kind === "rows" && (
        <div className="space-y-4">
          <Stepper label={t("farmer.q4.row_count")} value={layout.rows ?? 10} onChange={(v) => set("field_layout", { ...layout, rows: v })} min={1} max={1000} />
          <Stepper label={t("farmer.q4.spacing")} value={layout.spacing_m ?? 1} onChange={(v) => set("field_layout", { ...layout, spacing_m: v })} min={0.1} max={20} step={0.1} decimals={1} />
        </div>
      )}
      {layout.kind === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Stepper label="↔" value={layout.grid_width ?? 10} onChange={(v) => set("field_layout", { ...layout, grid_width: v })} min={1} max={1000} />
          <Stepper label="↕" value={layout.grid_height ?? 10} onChange={(v) => set("field_layout", { ...layout, grid_height: v })} min={1} max={1000} />
        </div>
      )}
    </div>,

    // 5. watering
    <div key="watering" className="space-y-5">
      <h2 className={title}>{t("farmer.q5.title")}</h2>
      <ChoiceGrid
        value={profile.watering_method}
        onChange={(v) => set("watering_method", v)}
        options={[
          { value: "drip", label: t("farmer.q5.drip"), picture: "💧" },
          { value: "flood", label: t("farmer.q5.flood"), picture: "🌊" },
          { value: "sprinkler", label: t("farmer.q5.sprinkler"), picture: "💦" },
          { value: "rain_fed", label: t("farmer.q5.rain_fed"), picture: "🌧️" },
        ]}
      />
    </div>,

    // 6. salinity history
    <div key="salinity" className="space-y-5">
      <h2 className={title}>{t("farmer.q6.title")}</h2>
      <ChoiceGrid
        cols={3}
        value={profile.salinity_history}
        onChange={(v) => set("salinity_history", v)}
        options={[
          { value: "yes", label: t("farmer.q6.yes"), picture: "🧂" },
          { value: "no", label: t("farmer.q6.no"), picture: "🌿" },
          { value: "unsure", label: t("farmer.q6.unsure"), picture: "🤷" },
        ]}
      />
    </div>,

    // 7. location: state + season pick lists
    <div key="location" className="space-y-5">
      <h2 className={title}>{t("farmer.q7.title")}</h2>
      <label className="block space-y-1.5">
        <span className="text-base font-medium text-gray-700 dark:text-gray-300">📍 {t("farmer.q7.region")}</span>
        <select
          value={profile.region ?? ""}
          onChange={(e) => set("region", e.target.value)}
          className="w-full rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-4 text-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:border-leaf-500"
        >
          <option value="">{t("farmer.q7.region_pick")}</option>
          {REGIONS.map((r) => (
            <option key={r.en} value={r.en}>{locale === "hi" ? `${r.hi} (${r.en})` : r.en}</option>
          ))}
        </select>
      </label>
      <div className="space-y-1.5">
        <p className="text-base font-medium text-gray-700 dark:text-gray-300">🗓️ {t("farmer.q7.season")}</p>
        <ChoiceGrid
          value={profile.season ?? ""}
          onChange={(v) => set("season", v)}
          options={SEASONS.map((s) => ({
            value: s,
            label: t(`season.${s}`),
            picture: { kharif: "🌧️", rabi: "❄️", zaid: "☀️", all_year: "🔁" }[s],
          }))}
        />
      </div>
    </div>,

    // 8. alert threshold
    <div key="alerts" className="space-y-5">
      <h2 className={title}>{t("farmer.q8.title")}</h2>
      <ChoiceGrid
        value={profile.alert_threshold}
        onChange={(v) => set("alert_threshold", v)}
        options={[
          { value: "fairly_sure", label: t("farmer.q8.fairly_sure"), picture: "🎯" },
          { value: "tell_me_early", label: t("farmer.q8.tell_me_early"), picture: "🔔" },
        ]}
      />
    </div>,

    // 9. language — already chosen from the top bar; this confirms it
    <div key="language" className="space-y-5">
      <h2 className={title}>{t("farmer.q9.title")}</h2>
      <ChoiceGrid
        value={locale}
        onChange={(v) => {
          setLocale(v)
          set("language", v)
        }}
        options={SUPPORTED_LOCALES.map((l) => ({ value: l.code, label: l.label, picture: l.code === "hi" ? "अ" : "A" }))}
      />
    </div>,
  ]

  return (
    <div className="min-h-dvh ambient-leaf-bg flex flex-col">
      <TopBar />
      <div className="flex-1 flex items-start sm:items-center justify-center px-4 pb-8">
        <div className="w-full max-w-lg space-y-4">
          {/* progress dots instead of "Step 5 of 9" */}
          <div className="flex justify-center gap-2" aria-label={t("onboarding.step", { current: step + 1, total: TOTAL_STEPS })}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={`h-2.5 rounded-full transition-all ${i === step ? "w-8 bg-leaf-600" : i < step ? "w-2.5 bg-leaf-500" : "w-2.5 bg-leaf-100 dark:bg-gray-700"}`}
              />
            ))}
          </div>

          <Guide key={step} text={t(STEP_GUIDE[step])} mood={guideMood} />

          <div key={`card-${step}`} className="bg-white dark:bg-gray-800 rounded-3xl surface p-5 sm:p-7 space-y-6 animate-fade-in">
            {steps[step]}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => step > 0 && goTo(step - 1)}
              disabled={step === 0}
              className="rounded-2xl px-5 py-4 text-lg font-semibold text-gray-600 dark:text-gray-300 disabled:opacity-0 cursor-pointer"
            >
              ← {t("onboarding.back")}
            </button>
            <div className="flex items-center gap-3">
              <button type="button" onClick={next} className="text-gray-500 dark:text-gray-400 font-medium px-2 py-4 cursor-pointer">
                {t("onboarding.skip")}
              </button>
              <button
                type="button" onClick={next} disabled={saving}
                className="btn-3d rounded-2xl bg-leaf-600 hover:bg-leaf-700 text-white text-lg font-semibold px-8 py-4 disabled:opacity-60 cursor-pointer"
              >
                {step === TOTAL_STEPS - 1 ? `${t("onboarding.finish")} ✓` : `${t("onboarding.next")} →`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
