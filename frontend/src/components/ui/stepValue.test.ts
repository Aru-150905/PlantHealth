import { describe, expect, it } from "vitest"
import { stepValue } from "./stepValue"

describe("stepValue", () => {
  it("steps and reports when a bound is reached, so a held button stops repeating", () => {
    expect(stepValue({ current: 20, dir: -1, step: 10, min: 10, max: 100 })).toEqual({ value: 10, atBound: true })
    expect(stepValue({ current: 50, dir: 1, step: 10, min: 10, max: 100 })).toEqual({ value: 60, atBound: false })
    expect(stepValue({ current: 95, dir: 1, step: 10, min: 10, max: 100 })).toEqual({ value: 100, atBound: true })
  })

  it("applies the hold speed-up multiplier and keeps decimals tidy", () => {
    expect(stepValue({ current: 100, dir: 1, step: 10, mult: 10, min: 1, max: 5000 }).value).toBe(200)
    expect(stepValue({ current: 1.2, dir: 1, step: 0.1, min: 0.1, max: 20, decimals: 1 }).value).toBe(1.3)
  })
})
