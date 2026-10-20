import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import type { TrendPoint } from "../api/client"

/**
 * Section 6: "Trend over the last 24 hours / 7 days — is it getting worse?" Single series
 * (no legend box needed — the title names it, per the dataviz skill), 2px line via
 * Recharts' default stroke width set explicitly, ~10% area wash, hairline recessive grid,
 * hover tooltip. Status-critical red because the y-axis is specifically "how stressed does
 * this block look," a severity measure — not a generic series.
 *
 * Only rendered for tiers with exact_pct confidence (Premium/Pro) — see TrendSummary for
 * Basic, which gets the coarse-band-appropriate plain-language version instead of a chart
 * built on invented numbers.
 */
export default function TrendChart({ points, days }: { points: TrendPoint[]; days: 1 | 7 }) {
  const data = points.map((p) => {
    const r = p.result
    // unified 0-100 "how stressed does this look" axis: a healthy reading contributes 0,
    // a genuinely unknown reading is a gap (never a fabricated height), a stressed reading
    // contributes its own calibrated confidence.
    const value = r.unknown ? null : r.stressed ? (r.confidence_pct ?? 0) : 0
    return {
      label: days === 1
        ? `${Math.round(p.days_ago * 24)}h ago`
        : p.days_ago < 0.5 ? "now" : `${Math.round(p.days_ago)}d ago`,
      value,
      unknown: r.unknown,
    }
  })

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--status-critical)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--status-critical)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-gridline)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label" tick={{ fill: "var(--chart-text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--chart-baseline)" }} tickLine={false} interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]} tick={{ fill: "var(--chart-text-muted)", fontSize: 11 }}
            axisLine={false} tickLine={false} width={34} tickFormatter={(v) => `${v}%`}
          />
          <ReferenceLine y={70} stroke="var(--chart-baseline)" strokeDasharray="2 3" />
          <Tooltip
            formatter={(value, _name, item) => {
              const unknown = (item?.payload as { unknown?: boolean } | undefined)?.unknown
              return unknown ? ["not sure yet", "stress level"] : [`${value}%`, "stress level"]
            }}
            contentStyle={{
              background: "var(--chart-surface)", border: "1px solid var(--chart-gridline)",
              borderRadius: 8, fontSize: 12, color: "var(--chart-text-primary)",
            }}
          />
          <Area
            type="monotone" dataKey="value" stroke="var(--status-critical)" strokeWidth={2}
            fill="url(#trendFill)" connectNulls={false} dot={{ r: 4, fill: "var(--status-critical)", strokeWidth: 2, stroke: "var(--chart-surface)" }}
            activeDot={{ r: 5 }} isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
