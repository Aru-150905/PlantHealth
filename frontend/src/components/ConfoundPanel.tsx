import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { ConfoundPanelOut } from "../api/client"

/**
 * Section 7's confound panel — "the thing that makes it a research tool rather than a
 * toy." A single-hue bar chart (one measure — chamber temperature variability — compared
 * across the categorical class axis, not multiple series, so no categorical rainbow here)
 * with the flagged class picked out in the status-critical color, never color alone (the
 * banner below states the finding in words).
 */
export default function ConfoundPanel({ panel }: { panel: ConfoundPanelOut }) {
  const flaggedClass = panel.flagged && panel.flag_reason
    ? panel.by_class.reduce((a, b) => (a.env_air_temp_std_c_mean > b.env_air_temp_std_c_mean ? a : b)).class_label
    : null

  return (
    <div className="space-y-3">
      {!panel.confound_panel_enabled && (
        <p className="text-xs text-gray-400">
          This panel is most useful for a BOD/refrigerated incubator setup, where the
          compressor's duty cycle can correlate with treatment arm. Current chamber type:{" "}
          {panel.chamber_type ?? "not set"}.
        </p>
      )}

      {panel.by_class.length === 0 ? (
        <p className="text-sm text-gray-400">{panel.flag_reason}</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={panel.by_class} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--chart-gridline)" strokeWidth={1} vertical={false} />
              <XAxis dataKey="class_label" tick={{ fill: "var(--chart-text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--chart-baseline)" }} tickLine={false} />
              <YAxis tick={{ fill: "var(--chart-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
              <Tooltip
                formatter={(v, _n, item) => [`${Number(v).toFixed(4)} °C (n=${(item?.payload as { n_plants?: number } | undefined)?.n_plants})`, "chamber temp std"]}
                contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-gridline)", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="env_air_temp_std_c_mean" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {panel.by_class.map((c) => (
                  <Cell key={c.class_label} fill={c.class_label === flaggedClass ? "var(--status-critical)" : "#2a78d6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-gray-400">
            Mean chamber air-temperature standard deviation within-window, by predicted
            class ({panel.n_plants_analyzed} plants analyzed). A real confound would show up
            here as one class's chamber running mechanically noisier than the others —
            independent of the plant.
          </p>
        </>
      )}

      {panel.flagged && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 flex gap-2">
          <span>⚠️</span>
          <span>{panel.flag_reason}</span>
        </div>
      )}
      {!panel.flagged && panel.by_class.length >= 2 && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
          No suspicious chamber-temperature correlation detected across classes right now.
        </div>
      )}
    </div>
  )
}
