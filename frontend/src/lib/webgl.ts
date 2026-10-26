/** Whether this browser can create a WebGL context. Where it can't (very old phones,
 * blocked GPU, jsdom), the static SVG plant is shown instead of an empty box. */
export function hasWebGL(): boolean {
  try {
    if (typeof document === "undefined") return false
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl")
    return gl != null
  } catch {
    return false
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}
