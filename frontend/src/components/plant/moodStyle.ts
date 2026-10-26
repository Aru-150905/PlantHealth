import type { PlantLook, PlantMood } from "../../lib/plantLook"

/**
 * How each mood is drawn, shared by the 3D plant and its static SVG fallback so both always
 * agree. Every stressed mood is a blend from the healthy plant toward its full symptom set,
 * by `intensity` (plantLook.ts) — an uncertain reading is drawn with mild symptoms, never
 * the full picture.
 */
export interface MoodStyle {
  leaf: string // leaf colour
  droop: number // extra downward tilt of leaves, radians
  curl: number // 0..1, how narrow/curled leaflets get (drought)
  scorch: number // 0..1, brown leaf tips (heat)
  soil: string
  crust: number // 0..1, white salt crust on the soil (salinity)
  cracks: number // 0..1, dry cracks in the soil (drought)
  fruit: string
  stemLean: number // radians the stem top bends over
}

const HEALTHY: MoodStyle = {
  leaf: "#3f9a2f", droop: 0, curl: 0, scorch: 0, soil: "#5b3a1e", crust: 0, cracks: 0,
  fruit: "#e0262f", stemLean: 0,
}

const FULL_SYMPTOMS: Record<Exclude<PlantMood, "healthy">, MoodStyle> = {
  unwell: { ...HEALTHY, leaf: "#7d9a3a", droop: 0.35, stemLean: 0.12 },
  drought: { ...HEALTHY, leaf: "#b8a43a", droop: 0.85, curl: 0.55, soil: "#8a6a45", cracks: 1, stemLean: 0.35, fruit: "#c9502c" },
  heat: { ...HEALTHY, leaf: "#6f8f2c", droop: 0.4, scorch: 1, stemLean: 0.15 },
  salinity: { ...HEALTHY, leaf: "#a8b04a", droop: 0.3, crust: 1, scorch: 0.35, stemLean: 0.1 },
  unknown: { ...HEALTHY, leaf: "#8f9a88", fruit: "#b9a5a0", soil: "#6b5a4a" },
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const m = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `#${((1 << 24) | (m(ar, br) << 16) | (m(ag, bg) << 8) | m(ab, bb)).toString(16).slice(1)}`
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function moodStyle(look: PlantLook): MoodStyle {
  if (look.mood === "healthy") return HEALTHY
  const target = FULL_SYMPTOMS[look.mood]
  // unknown has no "intensity" — it's a fixed neutral look
  const t = look.mood === "unknown" ? 1 : Math.max(0, Math.min(1, look.intensity))
  return {
    leaf: mixHex(HEALTHY.leaf, target.leaf, t),
    droop: lerp(HEALTHY.droop, target.droop, t),
    curl: lerp(HEALTHY.curl, target.curl, t),
    scorch: lerp(HEALTHY.scorch, target.scorch, t),
    soil: mixHex(HEALTHY.soil, target.soil, t),
    crust: lerp(HEALTHY.crust, target.crust, t),
    cracks: lerp(HEALTHY.cracks, target.cracks, t),
    fruit: mixHex(HEALTHY.fruit, target.fruit, t),
    stemLean: lerp(HEALTHY.stemLean, target.stemLean, t),
  }
}
