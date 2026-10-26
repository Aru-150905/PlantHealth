// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { hasWebGL, resetWebGLProbeForTests } from "./webgl"

afterEach(() => {
  vi.restoreAllMocks()
  resetWebGLProbeForTests()
})

describe("hasWebGL", () => {
  it("is false where no WebGL context can be created (so the static plant shows instead)", () => {
    expect(hasWebGL()).toBe(false)
  })

  it("is false on WebGL1-only devices — three.js r163+ needs WebGL2 and would crash", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((type: string) => (type === "webgl" ? ({} as WebGLRenderingContext) : null)) as never,
    )
    expect(hasWebGL()).toBe(false)
  })

  it("is true with WebGL2, probes only once, and releases the probe context", () => {
    const loseContext = vi.fn()
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((type: string) => (type === "webgl2" ? { getExtension: () => ({ loseContext }) } : null)) as never,
    )
    expect(hasWebGL()).toBe(true)
    expect(hasWebGL()).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(loseContext).toHaveBeenCalledTimes(1)
  })
})
