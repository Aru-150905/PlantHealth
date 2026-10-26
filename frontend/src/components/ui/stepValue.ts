/** One − / + step for Stepper, clamped to [min, max]. `atBound` tells a held button to stop
 * repeating — a button that hits its limit can't rely on pointerup to stop the repeat
 * (some browsers don't deliver it to a button that just became disabled). */
export function stepValue({
  current, dir, step, mult = 1, min, max, decimals = 0,
}: {
  current: number; dir: 1 | -1; step: number; mult?: number; min: number; max: number; decimals?: number
}): { value: number; atBound: boolean } {
  const value = Math.min(max, Math.max(min, Number((current + dir * step * mult).toFixed(decimals))))
  return { value, atBound: value === (dir === 1 ? max : min) }
}
