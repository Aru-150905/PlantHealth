import { useState } from "react"
import type { FieldCell } from "../api/client"

/**
 * The sentinel field map — section 4: distinguish measured vs inferred, show confidence
 * decaying with distance, make the coverage ratio and the "set block size, watch
 * confidence change" interaction concrete. Rings render as rows (ring 0 = the sentinel at
 * top, ring N further down) rather than literal concentric geometry — see
 * backend/api/sentinel.py's docstring for why a literal GPS layout isn't something this
 * onboarding data supports; this is an honest abstraction of "further away," not a map.
 *
 * Status colors (good/critical/unknown), never bare — each carries an icon + the legend
 * below, per the dataviz skill. Opacity fades by ring regardless of tier (the SHAPE of
 * decay is for everyone, including Basic, which doesn't get exact confidence numbers —
 * only the precise percentage is tier-gated, not the visual "further = less sure" story).
 */

function statusOf(cell: FieldCell): "good" | "critical" | "unknown" {
  if (cell.result.unknown) return "unknown"
  return cell.result.stressed ? "critical" : "good"
}

const STATUS_STYLE: Record<string, { bg: string; icon: string; label: string }> = {
  good: { bg: "var(--status-good)", icon: "✓", label: "Healthy" },
  critical: { bg: "var(--status-critical)", icon: "!", label: "Stressed" },
  unknown: { bg: "var(--status-unknown)", icon: "?", label: "Not sure" },
}

function Cell({ cell }: { cell: FieldCell }) {
  const status = statusOf(cell)
  const style = STATUS_STYLE[status]
  const opacity = cell.ring === 0 ? 1 : Math.max(0.3, 1 - cell.ring * 0.14)
  const size = cell.ring === 0 ? 52 : 36

  return (
    <div
      className="relative flex items-center justify-center rounded-lg text-white font-bold shrink-0"
      style={{ width: size, height: size, background: style.bg, opacity }}
      title={`${style.label}${cell.is_measured ? " — sentinel (measured)" : " — inferred"}${cell.cell_count > 1 ? ` · ${cell.cell_count} plants` : ""}`}
    >
      {style.icon}
      {cell.is_measured && (
        <span className="absolute -top-1.5 -right-1.5 text-[10px] bg-white text-gray-800 rounded-full w-4 h-4 flex items-center justify-center shadow">
          📡
        </span>
      )}
      {cell.cell_count > 1 && (
        <span className="absolute -bottom-1.5 -right-1.5 text-[9px] bg-white/90 text-gray-700 rounded-full px-1 shadow">
          ×{cell.cell_count}
        </span>
      )}
    </div>
  )
}

export default function FieldMap({
  cells, blockSize, onBlockSizeChange, maxBlockSize = 2000,
}: {
  cells: FieldCell[]
  blockSize: number
  onBlockSizeChange: (size: number) => void
  maxBlockSize?: number
}) {
  const [localSize, setLocalSize] = useState(blockSize)
  const rings = [...new Set(cells.map((c) => c.ring))].sort((a, b) => a - b)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rings.map((ring) => (
          <div key={ring} className="flex items-center justify-center gap-2 flex-wrap">
            {cells.filter((c) => c.ring === ring).map((c, i) => <Cell key={`${ring}-${i}`} cell={c} />)}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        {Object.entries(STATUS_STYLE).map(([key, s]) => (
          <span key={key} className="flex items-center gap-1">
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded text-white text-[10px] font-bold"
              style={{ background: s.bg }}
            >
              {s.icon}
            </span>
            {s.label}
          </span>
        ))}
      </div>

      <div className="space-y-1 pt-1">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Block size</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{localSize} plants</span>
        </div>
        <input
          type="range" min={1} max={maxBlockSize} value={localSize}
          onChange={(e) => setLocalSize(Number(e.target.value))}
          onPointerUp={() => onBlockSizeChange(localSize)}
          onKeyUp={() => onBlockSizeChange(localSize)}
          className="w-full accent-leaf-600"
        />
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          A bigger block reaches further from the sensor — watch the outer cells fade.
        </p>
      </div>
    </div>
  )
}
