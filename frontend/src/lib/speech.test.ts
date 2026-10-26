import { describe, expect, it } from "vitest"
import { pickVoice } from "./speech"

const v = (lang: string, name = lang) => ({ lang, name }) as SpeechSynthesisVoice

describe("pickVoice", () => {
  it("returns null when the device has no voice for the language (never reads Hindi in an English voice)", () => {
    expect(pickVoice([v("en-US"), v("en-GB")], "hi")).toBeNull()
  })

  it("prefers the Indian variant", () => {
    expect(pickVoice([v("en-US"), v("en-IN")], "en")?.lang).toBe("en-IN")
    expect(pickVoice([v("hi-IN"), v("en-US")], "hi")?.lang).toBe("hi-IN")
  })

  it("falls back to any voice of that language", () => {
    expect(pickVoice([v("en-GB")], "en")?.lang).toBe("en-GB")
  })

  it("handles underscore-style language tags some Android browsers report", () => {
    expect(pickVoice([v("hi_IN")], "hi")?.lang).toBe("hi_IN")
  })
})
