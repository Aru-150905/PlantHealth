import { describe, expect, it } from "vitest"
import { localeToCarryIntoAccount } from "./locale"

describe("localeToCarryIntoAccount", () => {
  it("carries a language picked on the login screen into the account after login", () => {
    expect(localeToCarryIntoAccount({ pickedBeforeLogin: true, chosen: "hi", accountLanguage: "en" })).toBe("hi")
  })

  it("leaves the account's own language alone if nothing was picked this visit", () => {
    expect(localeToCarryIntoAccount({ pickedBeforeLogin: false, chosen: "hi", accountLanguage: "en" })).toBeNull()
  })

  it("does nothing when they already match", () => {
    expect(localeToCarryIntoAccount({ pickedBeforeLogin: true, chosen: "hi", accountLanguage: "hi" })).toBeNull()
  })
})
