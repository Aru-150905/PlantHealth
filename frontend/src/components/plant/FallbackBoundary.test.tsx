// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import FallbackBoundary from "./FallbackBoundary"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Boom(): never {
  throw new Error("WebGL 1 is not supported since r163")
}

describe("FallbackBoundary", () => {
  it("shows the fallback instead of unmounting the whole app when the 3D plant throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const el = document.createElement("div")
    const root = createRoot(el)
    act(() => {
      root.render(
        <div>
          <p>rest of the page</p>
          <FallbackBoundary fallback={<span>static plant</span>}><Boom /></FallbackBoundary>
        </div>,
      )
    })
    expect(el.textContent).toContain("static plant")
    expect(el.textContent).toContain("rest of the page")
    act(() => root.unmount())
  })
})
