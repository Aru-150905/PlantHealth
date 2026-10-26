import { describe, expect, it } from "vitest"
import { irrigationFor } from "./irrigation"

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
