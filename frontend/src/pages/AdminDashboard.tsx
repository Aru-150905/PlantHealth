import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { api, type AdminSummary } from "../api/client"

// Fixed categorical order (dataviz skill: assign hues in fixed order, never cycled) —
// slots 1-4 of the reference palette, one per predicted class, consistent everywhere this
// class breakdown appears.
const CLASS_COLORS: Record<string, string> = {
  healthy: "#2a78d6", drought: "#eb6834", heat: "#1baf7a", salinity: "#eda100",
}

function fmtLimit(n: number | null): string {
  return n === null ? "unlimited" : String(n)
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyDevice, setBusyDevice] = useState<string | null>(null)

  async function load() {
    try {
      setSummary(await api.adminSummary())
    } catch {
      setError("You don't have access to the admin dashboard.")
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleFlag(deviceId: string, current: boolean) {
    setBusyDevice(deviceId)
    try {
      await api.flagDevice(deviceId, !current)
      await load()
    } finally {
      setBusyDevice(null)
    }
  }

  if (error) {
    return <div className="min-h-dvh flex items-center justify-center text-stress-600">{error}</div>
  }
  if (!summary) {
    return <div className="min-h-dvh flex items-center justify-center text-gray-400">Loading…</div>
  }

  const mv = summary.model_version

  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="bg-amber-100 text-amber-900 text-center text-sm font-medium py-2 px-4">
        ⚠️ DEMO DATA — not from a real plant
      </div>
      <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <h1 className="text-lg font-semibold text-gray-800">PlantHealth · Admin</h1>
        <Link to="/" className="text-sm text-gray-500">← Back</Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-16 space-y-6">
        {/* Model registry */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <p className="font-medium text-gray-800 mb-3">Model registry</p>
          {mv ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><p className="text-gray-400 text-xs">Version</p><p className="font-mono text-xs">{mv.version}</p></div>
              <div><p className="text-gray-400 text-xs">Trained</p><p>{mv.trained_at ? new Date(mv.trained_at).toLocaleString() : "—"}</p></div>
              <div><p className="text-gray-400 text-xs">Window</p><p>{mv.window_minutes} min @ {mv.fs_hz} Hz</p></div>
              <div><p className="text-gray-400 text-xs">Tenants on this version</p><p>{mv.n_tenants_on_version}</p></div>
              <div><p className="text-gray-400 text-xs">Honest leave-one-plant-out accuracy</p><p className="font-semibold">{mv.honest_leave_one_plant_out_accuracy != null ? `${(mv.honest_leave_one_plant_out_accuracy * 100).toFixed(1)}%` : "—"}</p></div>
              <div><p className="text-gray-400 text-xs">Honest macro F1</p><p className="font-semibold">{mv.honest_leave_one_plant_out_macro_f1?.toFixed(3) ?? "—"}</p></div>
              <div><p className="text-gray-400 text-xs">Confound ablation (env. features)</p><p className="font-semibold">{mv.confound_ablation_accuracy_points_from_environment != null ? `+${mv.confound_ablation_accuracy_points_from_environment.toFixed(1)} pts` : "—"}</p></div>
              <div><p className="text-gray-400 text-xs">Trained on</p><p>synthetic data only</p></div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No model trained yet — run backend/ml/train.py.</p>
          )}
          <p className="text-[11px] text-gray-400 mt-3">
            This accuracy is from synthetic data — it measures whether the pipeline works,
            not real-world performance. See backend/ml/README.md.
          </p>
        </section>

        {/* Tenants */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <p className="font-medium text-gray-800 mb-3">Tenants ({summary.tenants.length})</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs border-b border-gray-100">
                  <th className="py-1.5 pr-3">Name</th>
                  <th className="py-1.5 pr-3">Tier</th>
                  <th className="py-1.5 pr-3">Role</th>
                  <th className="py-1.5 pr-3">Devices</th>
                  <th className="py-1.5 pr-3">Plants covered</th>
                  <th className="py-1.5 pr-3">History retained</th>
                  <th className="py-1.5 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {summary.tenants.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 pr-3">{t.name}</td>
                    <td className="py-1.5 pr-3 capitalize">{t.tier}</td>
                    <td className="py-1.5 pr-3 capitalize">{t.role}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{t.n_devices} / {fmtLimit(t.device_limit)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{t.n_plants_covered} / {fmtLimit(t.plants_limit)}</td>
                    <td className="py-1.5 pr-3">{fmtLimit(t.history_retention_days)}{t.history_retention_days ? " days" : ""}</td>
                    <td className="py-1.5 pr-3">{t.suspended ? <span className="text-stress-600">suspended</span> : <span className="text-leaf-700">active</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Device fleet health */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <p className="font-medium text-gray-800 mb-3">Device fleet health ({summary.devices.length})</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs border-b border-gray-100">
                  <th className="py-1.5 pr-3">Serial</th>
                  <th className="py-1.5 pr-3">Tenant</th>
                  <th className="py-1.5 pr-3">Last seen</th>
                  <th className="py-1.5 pr-3">Battery</th>
                  <th className="py-1.5 pr-3">Signal quality</th>
                  <th className="py-1.5 pr-3">Flags</th>
                  <th className="py-1.5 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {summary.devices.map((d) => (
                  <tr key={d.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-xs">{d.serial}</td>
                    <td className="py-1.5 pr-3">{d.tenant_name}</td>
                    <td className="py-1.5 pr-3">{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "never"}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{d.battery_pct != null ? `${d.battery_pct}%` : "—"}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{d.signal_quality != null ? d.signal_quality.toFixed(2) : "—"}</td>
                    <td className="py-1.5 pr-3 space-x-1">
                      {d.electrode_drift_flagged && <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs">drift</span>}
                      {d.artefact_flagged && <span className="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs">artefact</span>}
                    </td>
                    <td className="py-1.5 pr-3">
                      <button
                        onClick={() => toggleFlag(d.id, d.artefact_flagged)}
                        disabled={busyDevice === d.id}
                        className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {d.artefact_flagged ? "Unflag" : "Flag as artefact"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Prediction volume */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <p className="font-medium text-gray-800 mb-1">Prediction volume &amp; class distribution</p>
          {summary.prediction_volume.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No predictions recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={summary.prediction_volume} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="var(--chart-gridline)" strokeWidth={1} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "var(--chart-text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--chart-baseline)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--chart-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--chart-surface)", border: "1px solid var(--chart-gridline)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {(["healthy", "drought", "heat", "salinity"] as const).map((cls) => (
                  <Bar key={cls} dataKey={cls} stackId="a" fill={CLASS_COLORS[cls]} radius={cls === "salinity" ? [4, 4, 0, 0] : undefined} maxBarSize={48} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </main>
    </div>
  )
}
