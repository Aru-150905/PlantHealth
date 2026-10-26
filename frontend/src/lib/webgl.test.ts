// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { hasWebGL } from "./webgl"

describe("hasWebGL", () => {
  it("is false where no WebGL context can be created (so the static plant shows instead)", () => {
    expect(hasWebGL()).toBe(false)
  })
})
