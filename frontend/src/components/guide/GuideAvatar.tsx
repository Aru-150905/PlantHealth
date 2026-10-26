import type { GuideCharacter } from "../../api/client"

/**
 * The two helper characters, drawn as layered inline SVG so they stay crisp at any size,
 * need no image downloads, and can be animated with plain CSS (index.css "guide-*"
 * keyframes): idle sway + blink always; a nod when the farmer picks something; a point
 * toward the next button; a happy bounce; a concerned brow when a reading is bad. All
 * motion is switched off under prefers-reduced-motion.
 *
 * Drawn warm and respectful — everyday village clothing, not costume or caricature.
 */
export type GuideMood = "idle" | "nod" | "point" | "happy" | "concern"

const SKIN = { didi: "#c98b5a", bhaiya: "#a8693d" }

function Face({ who, mood }: { who: GuideCharacter; mood: GuideMood }) {
  const browY = mood === "concern" ? 1.5 : 0
  return (
    <g className="guide-head">
      {/* ears + earrings */}
      <ellipse cx="41" cy="56" rx="4" ry="6" fill={SKIN[who]} />
      <ellipse cx="79" cy="56" rx="4" ry="6" fill={SKIN[who]} />
      {who === "didi" && (
        <>
          <circle cx="41" cy="64" r="2.6" fill="#e8b23a" />
          <circle cx="79" cy="64" r="2.6" fill="#e8b23a" />
        </>
      )}
      {/* face */}
      <ellipse cx="60" cy="55" rx="19" ry="22" fill={SKIN[who]} />
      {who === "didi" ? (
        <>
          {/* hair with centre parting and bun */}
          <path d="M40 52 Q40 30 60 30 Q80 30 80 52 Q76 38 60 37 Q44 38 40 52Z" fill="#1f1611" />
          <circle cx="60" cy="30" r="8" fill="#1f1611" />
          <path d="M60 33 L60 40" stroke="#b3122e" strokeWidth="1.6" />
          <circle cx="60" cy="46" r="2" fill="#b3122e" />
        </>
      ) : (
        <>
          {/* pagdi (turban) with folds */}
          <path d="M37 47 Q36 26 60 24 Q84 26 83 47 Q72 40 60 40 Q48 40 37 47Z" fill="#e8730c" />
          <path d="M39 42 Q60 30 81 42" stroke="#c45a05" strokeWidth="2.2" fill="none" />
          <path d="M40 36 Q60 24 80 36" stroke="#f59e3b" strokeWidth="2" fill="none" />
          <path d="M79 38 Q90 44 86 58" stroke="#e8730c" strokeWidth="5" fill="none" strokeLinecap="round" />
          {/* moustache */}
          <path d="M51 66 Q56 62 60 65 Q64 62 69 66 Q64 68 60 66.5 Q56 68 51 66Z" fill="#3b2a20" />
        </>
      )}
      {/* brows */}
      <path d={`M48 ${47 + browY} Q52 ${45 - browY} 56 ${47}`} stroke="#2b1d14" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d={`M64 47 Q68 ${45 - browY} 72 ${47 + browY}`} stroke="#2b1d14" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* eyes (blink) */}
      <g className="guide-eyes">
        <ellipse cx="52" cy="54" rx="2.6" ry="3" fill="#1d1410" />
        <ellipse cx="68" cy="54" rx="2.6" ry="3" fill="#1d1410" />
        <circle cx="53" cy="53" r="0.9" fill="#fff" />
        <circle cx="69" cy="53" r="0.9" fill="#fff" />
      </g>
      {/* cheeks */}
      <circle cx="47" cy="62" r="3.2" fill="#e0675a" opacity="0.25" />
      <circle cx="73" cy="62" r="3.2" fill="#e0675a" opacity="0.25" />
      {/* mouth */}
      {mood === "concern" ? (
        <path d="M54 71 Q60 68 66 71" stroke="#6b2a1a" strokeWidth="2" fill="none" strokeLinecap="round" />
      ) : mood === "happy" ? (
        <path d="M52 68 Q60 77 68 68 Z" fill="#7a2a1c" />
      ) : (
        <path d="M53 69 Q60 74 67 69" stroke="#6b2a1a" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
    </g>
  )
}

function Body({ who }: { who: GuideCharacter }) {
  if (who === "didi") {
    return (
      <g>
        {/* blouse + saree with pallu over the shoulder */}
        <path d="M30 150 Q30 100 60 92 Q90 100 90 150Z" fill="#f2c94c" />
        <path d="M30 150 Q31 108 48 98 L82 150Z" fill="#d6336c" />
        <path d="M48 98 Q62 96 76 112 L92 150 L82 150 Z" fill="#c2255c" />
        <path d="M48 98 L82 150" stroke="#e8b23a" strokeWidth="3" />
        <path d="M33 140 Q60 146 88 140" stroke="#e8b23a" strokeWidth="2.5" fill="none" />
        <rect x="54" y="80" width="12" height="13" rx="4" fill={SKIN.didi} />
      </g>
    )
  }
  return (
    <g>
      {/* kurta with a gamchha (scarf) */}
      <path d="M30 150 Q30 100 60 92 Q90 100 90 150Z" fill="#f4f1ea" />
      <path d="M60 94 L60 122" stroke="#cfc8b8" strokeWidth="1.5" />
      <circle cx="60" cy="104" r="1.3" fill="#a59d8a" />
      <circle cx="60" cy="112" r="1.3" fill="#a59d8a" />
      <path d="M40 98 Q60 112 80 98 L84 106 Q60 120 36 106Z" fill="#c92a2a" />
      <path d="M40 101 Q60 114 80 101" stroke="#f8f9fa" strokeWidth="1.2" fill="none" strokeDasharray="3 3" />
      <rect x="54" y="80" width="12" height="13" rx="4" fill={SKIN.bhaiya} />
    </g>
  )
}

function Arm({ who, mood }: { who: GuideCharacter; mood: GuideMood }) {
  const sleeve = who === "didi" ? "#f2c94c" : "#f4f1ea"
  return (
    <g className={mood === "point" ? "guide-arm-point" : "guide-arm"}>
      <path d="M84 104 Q98 112 100 128" stroke={sleeve} strokeWidth="11" fill="none" strokeLinecap="round" />
      <circle cx="100" cy="130" r="5.5" fill={SKIN[who]} />
    </g>
  )
}

export default function GuideAvatar({
  who, mood = "idle", size = 96,
}: { who: GuideCharacter; mood?: GuideMood; size?: number }) {
  return (
    <svg
      viewBox="0 0 120 150" width={size} height={size * 1.25}
      className={`guide-avatar shrink-0 ${mood === "nod" ? "guide-nod" : ""} ${mood === "happy" ? "guide-happy" : ""}`}
      aria-hidden
    >
      <ellipse cx="60" cy="148" rx="34" ry="3" fill="#0002" />
      <g className="guide-body">
        <Body who={who} />
        <Arm who={who} mood={mood} />
        <Face who={who} mood={mood} />
      </g>
    </svg>
  )
}
