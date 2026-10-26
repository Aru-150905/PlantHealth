/** Whether this browser can run the 3D plant. three.js r163+ needs WebGL2 (it no longer
 * supports WebGL1), so a WebGL1-only phone must get the static plant — probing for WebGL1
 * too would let three.js throw at startup. Probed once and cached, and the probe context is
 * released straight away (browsers cap live WebGL contexts; old phones have very few). */
let cached: boolean | null = null

export function hasWebGL(): boolean {
  if (cached !== null) return cached
  try {
    if (typeof document === "undefined") return (cached = false)
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null
    if (!gl) return (cached = false)
    gl.getExtension("WEBGL_lose_context")?.loseContext()
    return (cached = true)
  } catch {
    return (cached = false)
  }
}

export function resetWebGLProbeForTests(): void {
  cached = null
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}
