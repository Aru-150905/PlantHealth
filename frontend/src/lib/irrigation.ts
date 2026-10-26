import type { TranslationKey } from "../i18n/en"
import type { PlantLook } from "./plantLook"

/**
 * The water control is named after how this farm is actually watered (onboarding Q5) —
 * offering "sprinklers" to a drip farmer would be a wrong claim. A rain-fed farm has no
 * irrigation to switch on, so it gets no control at all (the backend refuses it too:
 * routers/actuators.py).
 */
export interface IrrigationControl {
  labelKey: TranslationKey
  icon: string
}

const BY_METHOD: Record<string, IrrigationControl> = {
  drip: { labelKey: "farmer.act.irrigate.drip", icon: "💧" },
  sprinkler: { labelKey: "farmer.act.irrigate.sprinkler", icon: "💦" },
  flood: { labelKey: "farmer.act.irrigate.flood", icon: "🌊" },
}

export function irrigationFor(method: string | undefined): IrrigationControl | null {
  if (method === "rain_fed") return null
  return BY_METHOD[method ?? "drip"] ?? BY_METHOD.drip
}

/** The app may *suggest* watering only on a confident drought reading the farmer's tier
 * actually received — never on a "maybe thirsty" one, so the offer never sounds surer than
 * the plant picture does. (Fertiliser is never suggested at all.) */
export function shouldSuggestIrrigation(look: PlantLook, remedyAvailable: boolean): boolean {
  return look.mood === "drought" && !look.uncertain && remedyAvailable
}
