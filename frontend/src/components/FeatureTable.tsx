import type { FeaturesOut } from "../api/client"

/** Section 7: "The computed feature values per window, in a table." Raw, numeric, lab
 * wording — no plain-language translation (that's the farmer vocabulary's job). */
export default function FeatureTable({ features }: { features: FeaturesOut["features"] }) {
  const entries = Object.entries(features).sort(([a], [b]) => a.localeCompare(b))
  return (
    <div className="max-h-64 overflow-y-auto">
      <table className="w-full text-sm">
        <tbody>
          {entries.map(([name, value]) => (
            <tr key={name} className="border-b border-gray-50 last:border-0">
              <td className="py-1.5 pr-3 text-gray-500 font-mono text-xs">{name}</td>
              <td className="py-1.5 text-right font-mono text-xs text-gray-800 tabular-nums">
                {Number.isFinite(value) ? value.toFixed(4) : String(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
