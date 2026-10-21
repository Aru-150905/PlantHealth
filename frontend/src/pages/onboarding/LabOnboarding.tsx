import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, type LabProfile } from "../../api/client"
import { useAuth } from "../../state/auth"

const DEFAULTS: LabProfile = {
  species: "tomato",
  n_plants: 40,
  n_treatment_arms: 4,
  stresses: ["drought", "heat", "salinity"],
  replicates_per_arm: 10,
  chamber_type: "incubator",
  light_hours_on: 16,
  light_hours_off: 8,
  light_switch_time: "06:00",
  sampling_rate_hz: 10,
  n_channels: 3,
  amplifier_gain: 1000,
  has_ground_truth_assay: false,
  show_random_split_comparison: false,
  export_retention_preference: "",
}

const STRESS_OPTIONS = ["drought", "heat", "salinity", "control"]

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-400 dark:text-gray-500">{hint}</span>}
    </label>
  )
}

const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"

/**
 * Section 5: "Ask these as a single dense form, not a wizard — this user would rather see
 * everything at once." Every field maps 1:1 to a bullet in that section.
 */
export default function LabOnboarding() {
  const { refreshTenant } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<LabProfile>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [assayFile, setAssayFile] = useState<File | null>(null)

  const set = <K extends keyof LabProfile>(key: K, value: LabProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }))

  function toggleStress(s: string) {
    set("stresses", profile.stresses.includes(s) ? profile.stresses.filter((x) => x !== s) : [...profile.stresses, s])
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.submitLabOnboarding(profile)
      await refreshTenant()
      navigate("/lab")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 px-4 py-10">
      <form onSubmit={onSubmit} className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-2xl surface p-8 space-y-10 animate-fade-in">
        <div>
          <h1 className="font-display text-2xl font-semibold text-gray-800 dark:text-gray-100">Experiment setup</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            One form, all at once. Every answer below changes how predictions, validation, and
            the confound panel behave for this account — nothing here is cosmetic.
          </p>
        </div>

        {/* 1. Species */}
        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <legend className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 col-span-2">
            1 · Species
          </legend>
          <Field label="Species">
            <select value={profile.species} onChange={(e) => set("species", e.target.value)} className={inputCls}>
              <option value="tomato">Tomato</option>
              <option value="arabidopsis">Arabidopsis</option>
              <option value="rice">Rice</option>
              <option value="maize">Maize</option>
              <option value="other">Other</option>
            </select>
          </Field>
          {profile.species === "other" && (
            <Field label="Specify species">
              <input value={profile.species_other ?? ""} onChange={(e) => set("species_other", e.target.value)} className={inputCls} />
            </Field>
          )}
        </fieldset>

        {/* 2. Experimental design */}
        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <legend className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 col-span-2">
            2 · Experimental design
          </legend>
          <Field label="Number of plants">
            <input type="number" value={profile.n_plants ?? ""} onChange={(e) => set("n_plants", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Number of treatment arms">
            <input type="number" value={profile.n_treatment_arms ?? ""} onChange={(e) => set("n_treatment_arms", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Replicates per arm">
            <input type="number" value={profile.replicates_per_arm ?? ""} onChange={(e) => set("replicates_per_arm", Number(e.target.value))} className={inputCls} />
          </Field>
          <div className="space-y-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Which stresses</span>
            <div className="flex flex-wrap gap-2">
              {STRESS_OPTIONS.map((s) => (
                <button
                  type="button" key={s} onClick={() => toggleStress(s)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors cursor-pointer ${
                    profile.stresses.includes(s) ? "bg-gray-800 dark:bg-gray-600 text-white border-gray-800 dark:border-gray-600" : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        {/* 3. Chamber */}
        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <legend className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 col-span-2">
            3 · Chamber
          </legend>
          <Field label="Chamber type">
            <select value={profile.chamber_type} onChange={(e) => set("chamber_type", e.target.value)} className={inputCls}>
              <option value="incubator">BOD / refrigerated incubator</option>
              <option value="growth_room">Growth room</option>
              <option value="greenhouse">Greenhouse</option>
              <option value="open_bench">Open bench</option>
            </select>
          </Field>
          {profile.chamber_type === "incubator" && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-200 self-end">
              Confound panel enabled by default — the compressor cycles harder the further the
              setpoint sits from room temperature, which can correlate with your treatment label.
              See the lab view's confound panel once this is set up.
            </div>
          )}
        </fieldset>

        {/* 4. Light cycle */}
        <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <legend className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 col-span-3">
            4 · Light cycle
          </legend>
          <Field label="Hours on">
            <input type="number" step={0.5} value={profile.light_hours_on} onChange={(e) => set("light_hours_on", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Hours off">
            <input type="number" step={0.5} value={profile.light_hours_off} onChange={(e) => set("light_hours_off", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Switch time">
            <input type="time" value={profile.light_switch_time ?? ""} onChange={(e) => set("light_switch_time", e.target.value)} className={inputCls} />
          </Field>
        </fieldset>

        {/* 5. Acquisition settings */}
        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <legend className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 col-span-2">
            5 · Acquisition settings
          </legend>
          <Field label="Sampling rate (Hz)" hint="ADS1256, 10–100 Hz typical">
            <input type="number" value={profile.sampling_rate_hz} onChange={(e) => set("sampling_rate_hz", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Electrode configuration">
            <input value={profile.electrode_config ?? ""} onChange={(e) => set("electrode_config", e.target.value)} placeholder="e.g. differential leaf pair + stem reference" className={inputCls} />
          </Field>
          <Field label="Number of channels">
            <input type="number" value={profile.n_channels ?? ""} onChange={(e) => set("n_channels", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Amplifier gain">
            <input type="number" value={profile.amplifier_gain ?? ""} onChange={(e) => set("amplifier_gain", Number(e.target.value))} className={inputCls} />
          </Field>
        </fieldset>

        {/* 6. Ground truth assay */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
            6 · Ground-truth assay data
          </legend>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={profile.has_ground_truth_assay} onChange={(e) => set("has_ground_truth_assay", e.target.checked)} />
            I have RWC / proline / MDA / chlorophyll assay data with timepoints
          </label>
          {profile.has_ground_truth_assay && (
            <div className="space-y-1">
              <input type="file" accept=".csv" onChange={(e) => setAssayFile(e.target.files?.[0] ?? null)} className="text-sm" />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {assayFile ? `${assayFile.name} selected — ` : ""}
                Upload the actual file from the lab view once your account is set up.
              </p>
            </div>
          )}
        </fieldset>

        {/* 7. Validation preference */}
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
            7 · Validation
          </legend>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Leave-one-plant-out cross-validation is always used for the reported accuracy —
            windows from the same plant are correlated, so a random split would leak the
            answer into the test set. See the model metrics page for why this matters.
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox" checked={profile.show_random_split_comparison}
              onChange={(e) => set("show_random_split_comparison", e.target.checked)}
            />
            Also show the inflated random-split number for comparison, so I can see the leakage myself
          </label>
        </fieldset>

        {/* 8. Export and retention */}
        <fieldset>
          <legend className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
            8 · Export and retention needs
          </legend>
          <textarea
            value={profile.export_retention_preference ?? ""}
            onChange={(e) => set("export_retention_preference", e.target.value)}
            placeholder="e.g. need raw CSV export monthly, retain all data indefinitely for publication"
            className={`${inputCls} h-20`}
          />
        </fieldset>

        <button
          type="submit" disabled={saving}
          className="w-full rounded-lg bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-medium py-3 disabled:opacity-60 transition-colors cursor-pointer"
        >
          {saving ? "Saving…" : "Save and continue to the signal viewer"}
        </button>
      </form>
    </div>
  )
}
