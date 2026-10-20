import type { ShapFeature } from "../api/client"

/**
 * SHAP explanation (section 3/7, Pro tier). A horizontal bar per top feature: diverging
 * blue/red (the palette's diverging pair) around a neutral zero baseline — blue pushes
 * TOWARD the predicted class, red pushes AWAY from it. Direct value labels at each bar's
 * end (sparing, per the dataviz skill — there are only 5 bars here, not 50).
 */
export default function ShapPanel({ classLabel, features }: { classLabel: string; features: ShapFeature[] }) {
  const maxAbs = Math.max(...features.map((f) => Math.abs(f.shap_value)), 1e-6)

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        What pushed this window toward <span className="font-mono text-gray-600">{classLabel}</span> (blue) or away from it (red)
      </p>
      {features.map((f) => {
        const pct = (Math.abs(f.shap_value) / maxAbs) * 50
        const positive = f.shap_value >= 0
        return (
          <div key={f.feature} className="flex items-center gap-2 text-xs">
            <span className="w-32 shrink-0 text-right text-gray-500 font-mono truncate" title={f.feature}>{f.feature}</span>
            <div className="relative flex-1 h-4 bg-gray-50 rounded">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" />
              <div
                className="absolute top-0 bottom-0 rounded"
                style={{
                  background: positive ? "#2a78d6" : "#e34948",
                  left: positive ? "50%" : `${50 - pct}%`,
                  width: `${pct}%`,
                }}
              />
            </div>
            <span className="w-14 shrink-0 font-mono tabular-nums text-gray-600">{f.shap_value.toFixed(3)}</span>
          </div>
        )
      })}
    </div>
  )
}
