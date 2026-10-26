import { lazy, Suspense, useEffect, useRef, useState } from "react"
import type { PlantLook } from "../../lib/plantLook"
import { hasWebGL, prefersReducedMotion } from "../../lib/webgl"
import FallbackBoundary from "./FallbackBoundary"
import PlantFallback from "./PlantFallback"

const Plant3D = lazy(() => import("./Plant3D"))

/**
 * Where a plant appears on a page: picks 3D vs the static fallback, pauses rendering while
 * scrolled off-screen (battery on phones), and adds the floating "?" whenever the reading
 * is uncertain — so the picture never looks more sure than the result is.
 */
export default function PlantStage({
  look, size = "hero", interactive = true, label,
}: { look: PlantLook; size?: "hero" | "card"; interactive?: boolean; label?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [webgl] = useState(hasWebGL)
  // a lost GPU context (common on low-memory phones when the app is backgrounded) would
  // otherwise leave an empty box — drop to the static plant instead
  const [contextLost, setContextLost] = useState(false)
  const [reduced] = useState(prefersReducedMotion)

  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const staticPlant = <div className="h-full w-full p-6"><PlantFallback look={look} /></div>
  const height = size === "hero" ? "h-72 sm:h-96" : "h-56 sm:h-64 md:h-96"
  return (
    <div ref={box} className={`relative ${height} w-full select-none`} role="img" aria-label={label}>
      {/* soft ground glow so the plant sits on something rather than floating */}
      <div aria-hidden className="absolute inset-x-[15%] bottom-[6%] h-[22%] rounded-[50%] bg-leaf-500/15 dark:bg-leaf-500/10 blur-2xl" />
      {webgl && !contextLost ? (
        <FallbackBoundary fallback={staticPlant}>
          <Suspense fallback={<div className="h-full w-full p-6 opacity-70"><PlantFallback look={look} /></div>}>
            <Plant3D look={look} interactive={interactive} active={visible} reducedMotion={reduced} onContextLost={() => setContextLost(true)} />
          </Suspense>
        </FallbackBoundary>
      ) : (
        staticPlant
      )}
      {look.uncertain && (
        <span
          aria-hidden
          className="absolute top-3 right-[18%] w-11 h-11 rounded-full bg-white dark:bg-gray-800 surface text-2xl font-bold text-gray-500 dark:text-gray-300 flex items-center justify-center animate-bob"
        >
          ?
        </span>
      )}
    </div>
  )
}
