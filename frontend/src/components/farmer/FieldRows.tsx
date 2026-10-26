import { useEffect, useRef, useState } from "react"
import type { FieldCell } from "../../api/client"
import { useT } from "../../i18n"
import Stepper from "../ui/Stepper"

/**
 * The farmer's field view — replaces the "×64" square map, which the project owner
 * themselves couldn't read. Same data (backend/api/sentinel.py's rings: ring 0 = the
 * sensor plant, ring k = further away), drawn as rows of little plants that get paler the
 * further they are from the sensor, and turn into "?" where the guess is too weak to say.
 * No "×N" badges: each icon stands for a group, and the explainer says so in plain words.
 *
 * The block-size control stays (the brief requires it: "let the user set the block size
 * and watch the inferred confidence change"), asked as a plain question with a − / +
 * stepper. The detailed square map remains in components/FieldMap.tsx for anyone who
 * wants it.
 */
type Status = "good" | "critical" | "unknown"

function statusOf(cell: FieldCell): Status {
  if (cell.result.unknown || cell.is_unknown) return "unknown"
  return cell.result.stressed ? "critical" : "good"
}

const COLOR: Record<Status, string> = {
  good: "var(--status-good)",
  critical: "var(--status-critical)",
  unknown: "var(--status-unknown)",
}

function PlantIcon({ status, big }: { status: Status; big?: boolean }) {
  const size = big ? 46 : 30
  const c = COLOR[status]
  return (
    <svg viewBox="0 0 30 34" width={size} height={size * 1.13} aria-hidden>
      <path d="M9 24 L21 24 L19.5 32 L10.5 32Z" fill="#c0603a" />
      {status === "unknown" ? (
        <text x="15" y="20" textAnchor="middle" fontSize="16" fontWeight="700" fill={c}>?</text>
      ) : (
        <>
          <path d="M15 24 V10" stroke={c} strokeWidth="2.2" />
          <ellipse cx="10" cy="15" rx="5.5" ry="3" fill={c} transform={`rotate(${status === "critical" ? 35 : -25} 10 15)`} />
          <ellipse cx="20" cy="12" rx="5.5" ry="3" fill={c} transform={`rotate(${status === "critical" ? -35 : 25} 20 12)`} />
          <ellipse cx="15" cy="7" rx="3" ry="4" fill={c} />
        </>
      )}
    </svg>
  )
}

export default function FieldRows({
  cells, blockSize, onBlockSizeChange, maxBlockSize = 2000,
}: {
  cells: FieldCell[]
  blockSize: number
  onBlockSizeChange: (size: number) => void
  maxBlockSize?: number
}) {
  const { t } = useT()
  const [localSize, setLocalSize] = useState(blockSize)
  const debounce = useRef<number | null>(null)
  const rings = [...new Set(cells.map((c) => c.ring))].sort((a, b) => a - b)

  useEffect(() => () => {
    if (debounce.current) window.clearTimeout(debounce.current)
  }, [])

  function change(v: number) {
    setLocalSize(v)
    if (debounce.current) window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => onBlockSizeChange(v), 450)
  }

  return (
    <div className="space-y-5">
      <p className="text-gray-600 dark:text-gray-300">{t("farmer.field.explain")}</p>

      <div className="rounded-2xl bg-gradient-to-b from-[#f3ead9] to-[#e6d6b8] dark:from-[#2a241b] dark:to-[#1f1a13] p-3 space-y-1.5 overflow-hidden">
        {rings.map((ring, i) => {
          const opacity = ring === 0 ? 1 : Math.max(0.3, 1 - ring * 0.14)
          const row = cells.filter((c) => c.ring === ring)
          return (
            <div key={ring} className="flex items-end justify-center gap-1 flex-wrap" style={{ opacity }}>
              {i === 0 && <span className="sr-only">{t("farmer.field.row_near")}</span>}
              {row.map((c, j) => (
                <span key={j} className="relative inline-flex" title={c.is_measured ? t("farmer.field.sensor") : undefined}>
                  <PlantIcon status={statusOf(c)} big={c.is_measured} />
                  {c.is_measured && (
                    <span className="absolute -top-1 -right-2 text-base" aria-label={t("farmer.field.sensor")}>📡</span>
                  )}
                </span>
              ))}
            </div>
          )
        })}
        <div className="flex justify-between text-xs text-[#6b5638] dark:text-[#b8a582] pt-1">
          <span>↑ {t("farmer.field.row_near")}</span>
          <span>{t("farmer.field.row_far")} ↓</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-600 dark:text-gray-300">
        <span className="flex items-center gap-1"><PlantIcon status="good" /> {t("farmer.field.legend.healthy")}</span>
        <span className="flex items-center gap-1"><PlantIcon status="critical" /> {t("farmer.field.legend.stressed")}</span>
        <span className="flex items-center gap-1"><PlantIcon status="unknown" /> {t("farmer.field.legend.unknown")}</span>
        <span className="flex items-center gap-1">📡 {t("farmer.field.sensor")}</span>
      </div>

      <Stepper
        label={t("farmer.field.block_question")}
        value={localSize}
        onChange={change}
        min={1}
        max={maxBlockSize}
        step={10}
        unit={t("farmer.q2.unit")}
      />
    </div>
  )
}
