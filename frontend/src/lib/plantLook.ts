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
 * `intensity` (0..1) scales how strong the symptoms are drawn: Pro's severity when present,
 * otherwise the confidence band every tier receives, otherwise the exact %.
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

function intensityOf(r: PredictionResult): number {
  if (r.severity && r.severity in SEVERITY_INTENSITY) return SEVERITY_INTENSITY[r.severity]
  if (r.confidence_band === "fairly sure") return FULL
  if (r.confidence_band) return SOFT
  if (r.confidence_pct != null) return r.confidence_pct >= 70 ? FULL : SOFT
  return SOFT
}

export function plantLook(r: PredictionResult | null): PlantLook {
  if (!r || r.unknown || r.stressed == null) return { mood: "unknown", intensity: 0, uncertain: true }
  if (!r.stressed) return { mood: "healthy", intensity: 0, uncertain: false }

  const mood: PlantMood = r.class_label && STRESS_CLASSES.has(r.class_label)
    ? (r.class_label as PlantMood)
    : "unwell"
  const intensity = intensityOf(r)
  return { mood, intensity, uncertain: intensity < FULL }
}

/** For decorative uses (welcome/login) — always the healthy plant, never a reading. */
export const DECORATIVE_LOOK: PlantLook = { mood: "healthy", intensity: 0, uncertain: false }
