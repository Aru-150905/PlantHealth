import { useCallback, useEffect, useState } from "react"
import { api, type ActuatorAction, type ActuatorKind } from "../../api/client"
import { useT } from "../../i18n"
import { irrigationFor } from "../../lib/irrigation"
import { useToast } from "../ui/Toast"

const DURATIONS = [10, 20, 30]

/**
 * Water and fertiliser controls — a clearly labelled DEMO: nothing in the field switches on
 * (see backend/api/routers/actuators.py). Rules from the spec:
 *  - nothing ever starts by itself: a tap opens a confirmation, and only "Yes, start" acts;
 *  - the water button is named after how this farm waters, and a rain-fed farm gets none;
 *  - the app may *suggest* watering when the plants look thirsty, but never fertiliser —
 *    the model cannot detect nutrient problems.
 */
export default function ActionPanel({
  plantId, method, suggestIrrigation,
}: { plantId: string; method?: string; suggestIrrigation: boolean }) {
  const { t, locale } = useT()
  const toast = useToast()
  const [actions, setActions] = useState<ActuatorAction[]>([])
  const [confirm, setConfirm] = useState<{ kind: ActuatorKind; minutes: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const irrigation = irrigationFor(method)
  const labelOf = (kind: ActuatorKind, m: string | null = method ?? null) =>
    kind === "fertiliser" ? t("farmer.act.fertilise") : t((irrigationFor(m ?? undefined) ?? irrigationFor("drip")!).labelKey)

  const load = useCallback(async () => {
    try {
      setActions(await api.listActions(plantId))
    } catch {
      // history is secondary — the buttons still work without it
    }
  }, [plantId])

  useEffect(() => {
    load()
  }, [load])

  const running = actions.filter((a) => a.stopped_at == null && new Date(a.ends_at).getTime() > now)
  const runningKind = (k: ActuatorKind) => running.find((a) => a.kind === k)

  // tick once a second only while something is running (countdown), then refresh history
  useEffect(() => {
    if (running.length === 0) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running.length])

  async function start() {
    if (!confirm) return
    setBusy(true)
    try {
      await api.startAction(plantId, { kind: confirm.kind, duration_min: confirm.minutes })
      toast.success(t("farmer.act.started", { action: labelOf(confirm.kind) }))
      setConfirm(null)
      setNow(Date.now())
      await load()
    } catch {
      toast.error(t("farmer.act.error"))
    } finally {
      setBusy(false)
    }
  }

  async function stop(a: ActuatorAction) {
    try {
      await api.stopAction(plantId, a.id)
      toast.info(t("farmer.act.stopped"))
      await load()
    } catch {
      toast.error(t("farmer.act.error"))
    }
  }

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString(locale === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

  // a render helper, not a nested component — it must not remount every countdown tick
  function runningCard(a: ActuatorAction) {
    const left = Math.max(0, Math.round((new Date(a.ends_at).getTime() - now) / 1000))
    const total = a.duration_min * 60
    return (
      <div key={a.id} className="rounded-2xl border-2 border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/30 p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sky-900 dark:text-sky-100">
            <span className="animate-pulse" aria-hidden>{a.kind === "fertiliser" ? "🧪" : irrigationFor(a.method ?? undefined)?.icon ?? "💧"} </span>
            {t("farmer.act.running", { action: labelOf(a.kind, a.method) })}
          </p>
          <DemoBadge />
        </div>
        <div className="h-2.5 rounded-full bg-sky-100 dark:bg-sky-950 overflow-hidden">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${100 - (left / total) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sky-800 dark:text-sky-200 tabular-nums">{t("farmer.act.time_left", { m: Math.floor(left / 60), s: left % 60 })}</p>
          <button onClick={() => stop(a)} className="btn-3d rounded-xl bg-white dark:bg-gray-800 text-stress-600 font-semibold px-5 py-2.5 cursor-pointer">
            ⏹ {t("farmer.act.stop")}
          </button>
        </div>
      </div>
    )
  }

  const bigBtn = "btn-3d flex-1 rounded-2xl text-white text-lg font-semibold py-5 px-4 cursor-pointer disabled:opacity-50 flex flex-col items-center gap-1"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-gray-800 dark:text-gray-100">{t("farmer.act.title")}</h2>
        <DemoBadge />
      </div>

      {suggestIrrigation && irrigation && !runningKind("irrigation") && (
        <button
          onClick={() => setConfirm({ kind: "irrigation", minutes: 20 })}
          className="w-full text-left rounded-2xl bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-300 dark:border-amber-700 px-4 py-3 text-amber-900 dark:text-amber-100 font-semibold cursor-pointer"
        >
          {irrigation.icon} {t("farmer.act.suggest", { action: t(irrigation.labelKey) })} →
        </button>
      )}

      {running.map(runningCard)}

      <div className="flex gap-3">
        {irrigation ? (
          <button
            onClick={() => setConfirm({ kind: "irrigation", minutes: 20 })}
            disabled={!!runningKind("irrigation")}
            className={`${bigBtn} bg-sky-600 hover:bg-sky-700`}
          >
            <span className="text-3xl" aria-hidden>{irrigation.icon}</span>
            {t(irrigation.labelKey)}
          </button>
        ) : (
          <p className="flex-1 rounded-2xl bg-gray-50 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 p-4 text-sm flex items-center gap-2">
            <span className="text-2xl" aria-hidden>🌧️</span> {t("farmer.act.rain_fed_note")}
          </p>
        )}
        <button
          onClick={() => setConfirm({ kind: "fertiliser", minutes: 10 })}
          disabled={!!runningKind("fertiliser")}
          className={`${bigBtn} bg-amber-700 hover:bg-amber-800`}
        >
          <span className="text-3xl" aria-hidden>🧪</span>
          {t("farmer.act.fertilise")}
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">ⓘ {t("farmer.act.fertiliser_note")}</p>

      <details className="rounded-2xl bg-gray-50 dark:bg-gray-700/30 px-4 py-3">
        <summary className="font-medium text-gray-700 dark:text-gray-200 cursor-pointer">🕘 {t("farmer.act.history")}</summary>
        {actions.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 mt-2">{t("farmer.act.history_empty")}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {actions.slice(0, 8).map((a) => (
              <li key={a.id} className="text-sm text-gray-600 dark:text-gray-300 border-l-4 border-sky-300 dark:border-sky-700 pl-2">
                {t("farmer.act.history_item", { what: labelOf(a.kind, a.method), n: a.duration_min, when: fmtTime(a.started_at) })}
                {a.stopped_at && <span className="text-gray-400"> · {t("farmer.act.stopped_early")}</span>}
                <span className="text-amber-700 dark:text-amber-400"> · {t("common.demo")}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-3 animate-fade-in" onClick={() => !busy && setConfirm(null)}>
          <div
            role="dialog" aria-modal="true"
            className="w-full max-w-md rounded-3xl bg-white dark:bg-gray-800 surface p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-5xl" aria-hidden>{confirm.kind === "fertiliser" ? "🧪" : irrigation?.icon}</p>
              <DemoBadge />
            </div>
            <h3 className="font-display text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {t("farmer.act.confirm", { action: labelOf(confirm.kind), n: confirm.minutes })}
            </h3>
            <div className="space-y-2">
              <p className="font-medium text-gray-700 dark:text-gray-300">{t("farmer.act.how_long")}</p>
              <div className="grid grid-cols-3 gap-2">
                {DURATIONS.map((m) => (
                  <button
                    key={m} onClick={() => setConfirm({ ...confirm, minutes: m })} aria-pressed={confirm.minutes === m}
                    className={`rounded-xl py-3 text-lg font-semibold border-2 cursor-pointer ${
                      confirm.minutes === m ? "border-leaf-600 bg-leaf-50 dark:bg-leaf-700/25 text-leaf-800 dark:text-leaf-500" : "border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {t("farmer.act.minutes", { n: m })}
                  </button>
                ))}
              </div>
            </div>
            <p className="rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 px-4 py-3 text-sm">⚠️ {t("farmer.act.demo_note")}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} disabled={busy} className="flex-1 rounded-2xl border-2 border-gray-200 dark:border-gray-600 py-4 text-lg font-semibold text-gray-700 dark:text-gray-200 cursor-pointer">
                {t("common.cancel")}
              </button>
              <button onClick={start} disabled={busy} className="btn-3d flex-1 rounded-2xl bg-leaf-600 hover:bg-leaf-700 text-white py-4 text-lg font-semibold cursor-pointer disabled:opacity-60">
                {t("farmer.act.confirm_yes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DemoBadge() {
  const { t } = useT()
  return (
    <span className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-xs font-bold tracking-wide px-2.5 py-1">
      {t("common.demo")}
    </span>
  )
}
