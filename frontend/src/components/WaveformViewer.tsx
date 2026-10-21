import { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { api, type SignalOut } from "../api/client"
import { realSpectrum } from "../lib/fft"

/**
 * The lab view's waveform viewer (section 7): live signal with pan and zoom, a
 * frequency-domain view, and environmental channels alongside so confounds are visible.
 *
 * "Overlaid" is implemented as a second small chart sharing the same time axis directly
 * below the main waveform, not a second y-axis on the same plot — a dual-axis chart is the
 * dataviz skill's #1 anti-pattern (two differently-scaled measures always get two charts,
 * never two axes), and it's also just not how you'd actually compare mV against °C.
 */

const ZOOM_OPTIONS = [
  { label: "1 min", minutes: 1 },
  { label: "5 min", minutes: 5 },
  { label: "30 min", minutes: 30 },
  { label: "2 hr", minutes: 120 },
]

export default function WaveformViewer({ plantId }: { plantId: string }) {
  const [duration, setDuration] = useState(5)
  const [offset, setOffset] = useState(0)
  const [view, setView] = useState<"time" | "frequency">("time")
  const [signal, setSignal] = useState<SignalOut | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.signal(plantId, duration, offset).then((s) => {
      if (!cancelled) {
        setSignal(s)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [plantId, duration, offset])

  const timeData = useMemo(() => {
    if (!signal) return []
    const t0 = signal.timestamp_s[0] ?? 0
    return signal.timestamp_s.map((t, i) => ({
      t: Math.round(t - t0), mv: signal.potential_mv[i], temp: signal.air_temp_c[i],
    }))
  }, [signal])

  const spectrum = useMemo(() => {
    if (!signal || view !== "frequency") return []
    const { freqs, magnitudes } = realSpectrum(signal.potential_mv, signal.fs_hz)
    return freqs.map((f, i) => ({ f: Number(f.toFixed(3)), mag: magnitudes[i] }))
  }, [signal, view])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs">
          <button
            onClick={() => setView("time")}
            className={`px-2.5 py-1 transition-colors cursor-pointer ${view === "time" ? "bg-gray-800 dark:bg-gray-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
          >
            Time domain
          </button>
          <button
            onClick={() => setView("frequency")}
            className={`px-2.5 py-1 transition-colors cursor-pointer ${view === "frequency" ? "bg-gray-800 dark:bg-gray-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
          >
            Frequency domain
          </button>
        </div>
        <div className="flex items-center gap-1 text-xs">
          {ZOOM_OPTIONS.map((z) => (
            <button
              key={z.minutes}
              onClick={() => setDuration(z.minutes)}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${duration === z.minutes ? "bg-gray-800 dark:bg-gray-600 text-white" : "text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">Loading signal…</p>}

      {!loading && signal && view === "time" && (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={timeData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--chart-gridline)" strokeWidth={1} vertical={false} />
              <XAxis dataKey="t" tick={{ fill: "var(--chart-text-muted)", fontSize: 10 }} axisLine={{ stroke: "var(--chart-baseline)" }} tickLine={false} />
              <YAxis tick={{ fill: "var(--chart-text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(2)} mV`, "potential"]}
                labelFormatter={(l) => `+${l}s`}
                contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-gridline)", borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="mv" stroke="#2a78d6" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 -mt-1">Differential leaf potential, mV</p>

          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={timeData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--chart-gridline)" strokeWidth={1} vertical={false} />
              <XAxis dataKey="t" tick={{ fill: "var(--chart-text-muted)", fontSize: 10 }} axisLine={{ stroke: "var(--chart-baseline)" }} tickLine={false} />
              <YAxis tick={{ fill: "var(--chart-text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={32} domain={["auto", "auto"]} />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(2)} °C`, "chamber air temp"]}
                labelFormatter={(l) => `+${l}s`}
                contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-gridline)", borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="temp" stroke="#eb6834" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 -mt-1">Chamber air temperature, °C — same time axis, separate scale (see confound panel)</p>
        </>
      )}

      {!loading && signal && view === "frequency" && (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={spectrum} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--chart-gridline)" strokeWidth={1} vertical={false} />
              <XAxis dataKey="f" tick={{ fill: "var(--chart-text-muted)", fontSize: 10 }} axisLine={{ stroke: "var(--chart-baseline)" }} tickLine={false} label={{ value: "Hz", position: "insideBottomRight", offset: -4, fontSize: 10, fill: "var(--chart-text-muted)" }} />
              <YAxis tick={{ fill: "var(--chart-text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                formatter={(v) => [Number(v).toExponential(2), "magnitude"]}
                labelFormatter={(l) => `${l} Hz`}
                contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-gridline)", borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="mag" stroke="#4a3aa7" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Nyquist = {(signal.fs_hz / 2).toFixed(1)} Hz at this zoom level's effective sample rate
            {signal.fs_hz < 100 && " — zoom out less (shorter duration) to resolve the 50 Hz mains band"}.
          </p>
        </>
      )}

      <div className="space-y-1 pt-1">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Pan (minutes before now)</span>
          <span className="font-mono">{offset.toFixed(0)}</span>
        </div>
        <input
          type="range" min={0} max={10080} step={duration}
          value={offset} onChange={(e) => setOffset(Number(e.target.value))}
          className="w-full accent-gray-700"
        />
      </div>
    </div>
  )
}
