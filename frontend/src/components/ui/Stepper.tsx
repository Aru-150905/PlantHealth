import { useEffect, useRef, useState } from "react"
import { stepValue } from "./stepValue"

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
  // what's typed is kept as text until the box loses focus, so "25" can be typed even when
  // the minimum is 10 (clamping on every keystroke would turn the "2" into 10)
  const [draft, setDraft] = useState<string | null>(null)

  /** Returns false once a bound is reached, so a held button stops repeating. */
  const bump = (dir: 1 | -1, mult = 1): boolean => {
    const { value: next, atBound } = stepValue({ current: latest.current, dir, step, mult, min, max, decimals })
    latest.current = next
    onChange(next)
    return !atBound
  }

  function startHold(dir: 1 | -1) {
    endHold()
    if (!bump(dir)) return
    let ticks = 0
    const run = () => {
      ticks += 1
      if (!bump(dir, ticks > 25 ? 10 : 1)) {
        timer.current = null
        return
      }
      timer.current = window.setTimeout(run, ticks > 8 ? 60 : 140)
    }
    timer.current = window.setTimeout(run, 400)
  }
  function endHold() {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => endHold, [])

  const btn = "btn-3d w-16 h-16 shrink-0 rounded-2xl text-3xl font-bold select-none cursor-pointer aria-disabled:opacity-40 touch-manipulation"
  return (
    <div className="space-y-1.5">
      {label && <p className="text-base font-medium text-gray-700 dark:text-gray-300">{label}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button" aria-label="−" aria-disabled={value <= min}
          onPointerDown={() => startHold(-1)} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && bump(-1)}
          className={`${btn} bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-100`}
        >
          −
        </button>
        <div className="flex-1 text-center">
          <input
            type="number" inputMode="decimal" value={draft ?? value} min={min} max={max} step={step}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft !== null && draft !== "" && Number.isFinite(Number(draft))) onChange(clamp(Number(draft)))
              setDraft(null)
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-full bg-transparent text-center text-4xl font-bold text-leaf-700 dark:text-leaf-500 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && <p className="text-sm text-gray-500 dark:text-gray-400 -mt-1">{unit}</p>}
        </div>
        <button
          type="button" aria-label="+" aria-disabled={value >= max}
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
