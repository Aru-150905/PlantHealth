import type { GuideCharacter } from "../../api/client"
import { useT } from "../../i18n"
import { useSpeech } from "../../lib/speech"
import { useAuth } from "../../state/auth"
import GuideAvatar, { type GuideMood } from "./GuideAvatar"

/**
 * The helper on every farmer screen: the chosen character with a speech bubble saying, in
 * plain words, what to do here — plus a 🔊 button that reads it aloud in the current
 * language (hidden when the device has no voice for it — see lib/speech.ts).
 */
export default function Guide({
  text, mood = "idle", who, className = "",
}: { text: string; mood?: GuideMood; who?: GuideCharacter; className?: string }) {
  const { t, locale } = useT()
  const { tenant } = useAuth()
  const { available, speaking, speak, stop } = useSpeech(locale)
  const character = who ?? tenant?.guide_character ?? "didi"

  return (
    <div className={`flex items-end gap-3 ${className}`}>
      <GuideAvatar who={character} mood={mood} size={72} />
      <div
        className="bubble-tail relative flex-1 rounded-2xl rounded-bl-md bg-white dark:bg-gray-800 surface px-4 py-3 [--bubble-bg:#fff] dark:[--bubble-bg:#1f2937]"
        aria-live="polite"
      >
        <p className="text-gray-800 dark:text-gray-100 text-base leading-snug">{text}</p>
        {available && (
          <button
            type="button"
            onClick={() => (speaking ? stop() : speak(text))}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-leaf-50 dark:bg-leaf-700/25 text-leaf-700 dark:text-leaf-500 text-sm font-semibold px-3 py-1.5 cursor-pointer hover:bg-leaf-100"
          >
            <span aria-hidden>{speaking ? "⏹" : "🔊"}</span> {speaking ? t("guide.stop") : t("guide.listen")}
          </button>
        )}
      </div>
    </div>
  )
}
