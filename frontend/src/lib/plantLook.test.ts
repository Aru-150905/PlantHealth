import { describe, expect, it } from "vitest"
import type { PredictionResult } from "../api/client"
import { plantLook } from "./plantLook"

function result(over: Partial<PredictionResult>): PredictionResult {
  return {
    stressed: false, class_label: null, confidence_band: "fairly sure", confidence_pct: null,
    unknown: false, diagnosis_remedy_available: false, severity_timeline_available: false,
    severity: null, estimated_timeline: null, shap_available: false, raw_export: "none",
    ...over,
  }
}

describe("plantLook", () => {
  it("shows the neutral unknown plant for a missing or unknown result", () => {
    expect(plantLook(null)).toEqual({ mood: "unknown", intensity: 0, uncertain: true })
    expect(plantLook(result({ unknown: true, stressed: null }))).toEqual({ mood: "unknown", intensity: 0, uncertain: true })
  })

  it("shows a healthy plant when not stressed", () => {
    expect(plantLook(result({ stressed: false, class_label: "healthy" }))).toEqual({ mood: "healthy", intensity: 0, uncertain: false })
  })

  it("never shows a specific stress on Basic (no class label) — generic unwell only", () => {
    expect(plantLook(result({ stressed: true, class_label: null, confidence_band: "fairly sure" })))
      .toEqual({ mood: "unwell", intensity: 1, uncertain: false })
  })

  it("softens symptoms and flags uncertainty for an uncertain band", () => {
    expect(plantLook(result({ stressed: true, class_label: "drought", confidence_band: "uncertain" })))
      .toEqual({ mood: "drought", intensity: 0.45, uncertain: true })
  })

  it("uses the exact percentage when given", () => {
    expect(plantLook(result({ stressed: true, class_label: "heat", confidence_band: null, confidence_pct: 90 })).intensity).toBe(1)
    expect(plantLook(result({ stressed: true, class_label: "heat", confidence_band: null, confidence_pct: 55 })).intensity).toBe(0.45)
  })

  it("scales by Pro severity when present", () => {
    expect(plantLook(result({ stressed: true, class_label: "salinity", confidence_pct: 72, severity: "moderate" })))
      .toEqual({ mood: "salinity", intensity: 0.75, uncertain: true })
    expect(plantLook(result({ stressed: true, class_label: "salinity", confidence_pct: 90, severity: "severe" })).intensity).toBe(1)
  })

  it("treats a class label of 'healthy' with stressed=true defensively as unwell", () => {
    expect(plantLook(result({ stressed: true, class_label: "healthy" })).mood).toBe("unwell")
  })
})
