/**
 * English strings. Section 5 Q9: "structure all UI strings for translation from day one
 * rather than retrofitting" — every farmer-facing (and shared) string lives in a flat
 * key->string dictionary here and in hi.ts, looked up via useT()/t() (src/i18n/index.tsx),
 * never inlined in JSX. Lab-facing strings are NOT translated (see hi.ts header for why) —
 * only this file's keys exist for both locales.
 */
const en = {
  "app.name": "PlantHealth",
  "role.question": "Are you growing plants, or studying them?",
  "role.farmer": "I'm growing plants",
  "role.lab": "I'm studying them",
  "role.change_hint": "You can change this anytime in Settings.",

  "onboarding.skip": "Skip",
  "onboarding.next": "Next",
  "onboarding.back": "Back",
  "onboarding.finish": "Done",
  "onboarding.step": "Step {current} of {total}",

  "farmer.q1.title": "What are you growing?",
  "farmer.q2.title": "Roughly how many plants?",
  "farmer.q3.title": "How many sensor units do you have?",
  "farmer.q3.coverage": "That's {ratio}",
  "farmer.q4.title": "How is the field laid out?",
  "farmer.q4.rows": "Rows",
  "farmer.q4.grid": "Grid",
  "farmer.q4.rough": "Rough sketch",
  "farmer.q5.title": "How do you water it?",
  "farmer.q5.drip": "Drip",
  "farmer.q5.flood": "Flood",
  "farmer.q5.sprinkler": "Sprinkler",
  "farmer.q5.rain_fed": "Rain-fed",
  "farmer.q6.title": "Has this land had salt problems before?",
  "farmer.q6.yes": "Yes",
  "farmer.q6.no": "No",
  "farmer.q6.unsure": "Not sure",
  "farmer.q7.title": "Where are you?",
  "farmer.q7.region": "Region",
  "farmer.q7.season": "Season",
  "farmer.q8.title": "When do you want to be told something is wrong?",
  "farmer.q8.fairly_sure": "Only when you're fairly sure",
  "farmer.q8.tell_me_early": "Tell me early, even if it might be nothing",
  "farmer.q9.title": "Language",

  "farmer.home.coverage": "Coverage",
  "farmer.home.verdict.stressed": "This block looks water-stressed",
  "farmer.home.verdict.healthy": "This block looks healthy",
  "farmer.home.confidence.fairly_sure": "fairly sure",
  "farmer.home.confidence.uncertain": "uncertain",
  "farmer.home.confidence.not_sure": "not sure yet — check back in a few hours",
  "farmer.home.what_to_do": "What should I do?",
  "farmer.home.upgrade_for_remedy": "Upgrade to see remedy guidance",
  "farmer.home.demo_banner": "DEMO DATA — not from a real plant",
  "farmer.home.field_map": "Your field",
  "farmer.home.trend": "Trend",
  "farmer.home.trend.day": "Last 24 hours",
  "farmer.home.trend.week": "Last 7 days",

  "settings.title": "Settings",
  "settings.role": "I am",
  "settings.language": "Language",
  "settings.tier": "Plan",
} as const

export default en
export type TranslationKey = keyof typeof en
