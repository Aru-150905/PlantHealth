import { useCallback, useEffect, useState } from "react"

/**
 * Read-aloud for the guide, using the phone's own built-in voices (speechSynthesis) — no
 * cloud service, works offline, costs nothing. Its limit: not every device has a Hindi
 * voice. Where it doesn't, the 🔊 button is hidden rather than reading Hindi text with an
 * English voice (which would be gibberish to the listener).
 */
const norm = (lang: string) => lang.replace("_", "-").toLowerCase()

export function pickVoice(voices: SpeechSynthesisVoice[], locale: string): SpeechSynthesisVoice | null {
  const want = locale.toLowerCase()
  const matching = voices.filter((v) => norm(v.lang).split("-")[0] === want)
  if (matching.length === 0) return null
  return matching.find((v) => norm(v.lang) === `${want}-in`) ?? matching[0]
}

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null
}

export function useSpeech(locale: string) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    const s = synth()
    if (!s) return
    // voices load asynchronously on most browsers
    const update = () => setVoice(pickVoice(s.getVoices(), locale))
    update()
    s.addEventListener("voiceschanged", update)
    return () => s.removeEventListener("voiceschanged", update)
  }, [locale])

  // stop talking when the screen changes
  useEffect(() => () => synth()?.cancel(), [])

  const speak = useCallback((text: string) => {
    const s = synth()
    if (!s || !voice) return
    s.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    u.rate = 0.9 // a little slower than default — easier to follow
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    setSpeaking(true)
    s.speak(u)
  }, [voice])

  const stop = useCallback(() => {
    synth()?.cancel()
    setSpeaking(false)
  }, [])

  return { available: voice != null, speaking, speak, stop }
}
