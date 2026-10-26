import type { PlantLook } from "../../lib/plantLook"
import { moodStyle } from "./moodStyle"

/** Static plant for devices without WebGL, and the placeholder while the 3D one loads.
 * Uses the same moodStyle as Plant3D so the two always tell the same story. */
export default function PlantFallback({ look }: { look: PlantLook }) {
  const s = moodStyle(look)
  const droopDeg = s.droop * 57
  const leaves: [number, number, number][] = [
    [80, 112, -30], [80, 96, 210], [80, 80, -20], [80, 64, 200], [80, 50, -10], [80, 40, 190],
  ]
  return (
    <svg viewBox="0 0 160 190" className="w-full h-full" role="img" aria-hidden>
      <ellipse cx="80" cy="182" rx="50" ry="6" fill="#0002" />
      <path d="M48 128 L112 128 L104 178 L56 178Z" fill="#c0603a" />
      <ellipse cx="80" cy="128" rx="32" ry="7" fill={s.soil} />
      {s.crust > 0.05 && <ellipse cx="80" cy="128" rx="30" ry="6" fill="none" stroke="#f1efe6" strokeWidth={3 * s.crust} opacity={0.9} />}
      <path d={`M80 128 Q78 90 ${82 + s.stemLean * 40} ${34 + s.stemLean * 20}`} stroke="#4f7d2a" strokeWidth="5" fill="none" strokeLinecap="round" />
      {leaves.map(([x, y, rot], i) => {
        const dir = rot > 90 ? -1 : 1
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${rot + dir * droopDeg})`}>
            <ellipse cx="22" cy="0" rx="22" ry={9 * (1 - s.curl * 0.55)} fill={s.leaf} />
            {s.scorch > 0.05 && <ellipse cx="40" cy="0" rx={6 * s.scorch} ry="6" fill="#7a3b12" />}
          </g>
        )
      })}
      <circle cx="66" cy="104" r="7" fill={s.fruit} />
      <circle cx="96" cy="98" r="6" fill={s.fruit} />
    </svg>
  )
}
