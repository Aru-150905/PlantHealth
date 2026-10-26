import type { PredictionResult } from "../api/client"

/**
 * The honesty core of the 3D plant: turns the tier-shaped API result into what the plant
 * is allowed to look like. The picture must never claim more than the text would — a
 * farmer who can't read the confidence line will believe the picture.
 *
 * - unknown / no result      -> neutral plant with a "?" (never a confident-looking plant)
 * - not stressed             -> healthy
 * - stressed, no class label -> generic "unwell" (Basic tier only gets stressed/not
 *                               stressed — drawing drought here would invent a diagnosis)
 * - stressed + class label   -> that class's symptoms
 *
 * `uncertain` comes from confidence alone (same rule on every tier); `intensity` (0..1)
 * scales how strong the symptoms are drawn — soft when uncertain, and within a confident
 * reading toned by Pro's severity when present.
 * Spec: docs/superpowers/specs/2026-10-26-farmer-friendly-3d-redesign-design.md §6.4, §9a.3.
 */
export type PlantMood = "healthy" | "unwell" | "drought" | "heat" | "salinity" | "unknown"

export interface PlantLook {
  mood: PlantMood
  intensity: number
  uncertain: boolean
}

const STRESS_CLASSES = new Set(["drought", "heat", "salinity"])
const SEVERITY_INTENSITY: Record<string, number> = { severe: 1, moderate: 0.75, mild: 0.45 }
const FULL = 1
const SOFT = 0.45

/** Whether the reading is confident — ONE rule for every tier: the band every tier gets
 * when present, otherwise the exact % (>= 70, the band's own "fairly sure" line). */
function isConfident(r: PredictionResult): boolean {
  if (r.confidence_band) return r.confidence_band === "fairly sure"
  if (r.confidence_pct != null) return r.confidence_pct >= 70
  return false
}

/** Symptom strength. A weak reading is always drawn soft. Within a confident reading, Pro's
 * severity may tone symptoms down (moderate/mild) — but it never turns a confident reading
 * into an unsure-looking one, or Pro would sound less sure than Basic for the same %. */
function intensityOf(r: PredictionResult, confident: boolean): number {
  if (!confident) return SOFT
  if (r.severity && r.severity in SEVERITY_INTENSITY) return SEVERITY_INTENSITY[r.severity]
  return FULL
}

export function plantLook(r: PredictionResult | null): PlantLook {
  if (!r || r.unknown || r.stressed == null) return { mood: "unknown", intensity: 0, uncertain: true }
  if (!r.stressed) return { mood: "healthy", intensity: 0, uncertain: false }

  const mood: PlantMood = r.class_label && STRESS_CLASSES.has(r.class_label)
    ? (r.class_label as PlantMood)
    : "unwell"
  const confident = isConfident(r)
  return { mood, intensity: intensityOf(r, confident), uncertain: !confident }
}

/** For decorative uses (welcome/login) — always the healthy plant, never a reading. */
export const DECORATIVE_LOOK: PlantLook = { mood: "healthy", intensity: 0, uncertain: false }
