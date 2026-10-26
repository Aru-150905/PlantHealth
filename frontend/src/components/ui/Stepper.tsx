import { useEffect, useRef } from "react"

/**
 * Big − / + control for numbers, so a farmer never has to type into a bare box. Holding a
 * button repeats (and speeds up), so large numbers like 500 plants are reachable without
 * tapping hundreds of times. The number itself is still editable for anyone who prefers to
 * type.
 */
export default function Stepper({
  value, onChange, min = 0, max = 100000, step = 1, unit, label, decimals = 0,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  label?: string
  decimals?: number
}) {
  const timer = useRef<number | null>(null)
  const latest = useRef(value)
  latest.current = value

  const clamp = (v: number) => Math.min(max, Math.max(min, Number(v.toFixed(decimals))))
  const bump = (dir: 1 | -1, mult = 1) => onChange(clamp(latest.current + dir * step * mult))

  function startHold(dir: 1 | -1) {
    bump(dir)
    let ticks = 0
    const run = () => {
      ticks += 1
      bump(dir, ticks > 25 ? 10 : 1)
      timer.current = window.setTimeout(run, ticks > 8 ? 60 : 140)
    }
    timer.current = window.setTimeout(run, 400)
  }
  function endHold() {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => endHold, [])

  const btn = "btn-3d w-16 h-16 shrink-0 rounded-2xl text-3xl font-bold select-none cursor-pointer disabled:opacity-40 touch-manipulation"
  return (
    <div className="space-y-1.5">
      {label && <p className="text-base font-medium text-gray-700 dark:text-gray-300">{label}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button" aria-label="−" disabled={value <= min}
          onPointerDown={() => startHold(-1)} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && bump(-1)}
          className={`${btn} bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-100`}
        >
          −
        </button>
        <div className="flex-1 text-center">
          <input
            type="number" inputMode="decimal" value={value} min={min} max={max} step={step}
            onChange={(e) => e.target.value !== "" && onChange(clamp(Number(e.target.value)))}
            className="w-full bg-transparent text-center text-4xl font-bold text-leaf-700 dark:text-leaf-500 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && <p className="text-sm text-gray-500 dark:text-gray-400 -mt-1">{unit}</p>}
        </div>
        <button
          type="button" aria-label="+" disabled={value >= max}
          onPointerDown={() => startHold(1)} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && bump(1)}
          className={`${btn} bg-leaf-600 text-white`}
        >
          +
        </button>
      </div>
    </div>
  )
}
