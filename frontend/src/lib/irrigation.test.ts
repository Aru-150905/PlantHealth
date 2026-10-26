import { describe, expect, it } from "vitest"
import { irrigationFor, shouldSuggestIrrigation } from "./irrigation"

describe("irrigationFor", () => {
  it("names the control after how the farm is actually watered", () => {
    expect(irrigationFor("drip")).toEqual({ labelKey: "farmer.act.irrigate.drip", icon: "💧" })
    expect(irrigationFor("sprinkler")).toEqual({ labelKey: "farmer.act.irrigate.sprinkler", icon: "💦" })
    expect(irrigationFor("flood")).toEqual({ labelKey: "farmer.act.irrigate.flood", icon: "🌊" })
  })

  it("offers nothing for a rain-fed farm", () => {
    expect(irrigationFor("rain_fed")).toBeNull()
  })

  it("falls back to drip when the method is unknown", () => {
    expect(irrigationFor(undefined)).toEqual({ labelKey: "farmer.act.irrigate.drip", icon: "💧" })
  })
})

describe("shouldSuggestIrrigation", () => {
  it("suggests water only for a confident drought reading the tier actually received", () => {
    expect(shouldSuggestIrrigation({ mood: "drought", intensity: 1, uncertain: false }, true)).toBe(true)
  })

  it("does not suggest it on a 'maybe thirsty' reading — the offer mustn't sound surer than the plant", () => {
    expect(shouldSuggestIrrigation({ mood: "drought", intensity: 0.45, uncertain: true }, true)).toBe(false)
  })

  it("never for other moods or when the tier doesn't get remedies", () => {
    expect(shouldSuggestIrrigation({ mood: "heat", intensity: 1, uncertain: false }, true)).toBe(false)
    expect(shouldSuggestIrrigation({ mood: "drought", intensity: 1, uncertain: false }, false)).toBe(false)
  })
})
