import type { TrendPoint } from "../api/client"

/**
 * Basic tier's trend view — section 9 gives Basic only a coarse confidence band, so this
 * deliberately does NOT draw a chart (that would mean inventing precise-looking pixel
 * heights from a band that was never that precise — see TrendChart's docstring). Instead:
 * a plain-language "better / worse / about the same" comparing the oldest and newest
 * readings, which is honest about exactly what a coarse band actually supports.
 */
function severity(p: TrendPoint): number | null {
  const r = p.result
  if (r.unknown) return null
  if (!r.stressed) return 0
  return r.confidence_band === "fairly sure" ? 2 : 1
}

export default function TrendSummary({ points }: { points: TrendPoint[] }) {
  const known = points.filter((p) => severity(p) !== null)
  if (known.length < 2) {
    return <p className="text-sm text-gray-400">Not enough history yet to show a trend.</p>
  }
  const oldest = severity(known[0])!
  const newest = severity(known[known.length - 1])!

  let text: string
  let emoji: string
  if (newest > oldest) {
    text = "Looks like it's getting worse."
    emoji = "📈"
  } else if (newest < oldest) {
    text = "Looks like it's getting better."
    emoji = "📉"
  } else {
    text = "About the same as before."
    emoji = "➡️"
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xl">{emoji}</span>
      <p className="text-sm text-gray-600">{text}</p>
    </div>
  )
}
