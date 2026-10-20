/**
 * Hindi strings — the brief's required second language (section 5 Q9: "Offer at minimum
 * English and Hindi"). Covers the farmer-facing flow and shared chrome (role screen,
 * onboarding, settings), matching en.ts key-for-key.
 *
 * The lab flow is intentionally NOT translated here. Section 5's vocabulary table draws a
 * hard line between the two: lab wording is precise, numeric, and jargon-forward by design
 * ("Predicted class: drought (p = 0.74, calibrated)") for a plant physiologist audience —
 * translating that register risks losing exactness in a way the farmer copy's plain
 * language doesn't. If a Hindi-speaking lab researcher is a real need later, that's a
 * separate, deliberate translation pass of src/i18n/lab.*.ts — not a mechanical extension
 * of this file.
 */
import type { TranslationKey } from "./en"

const hi: Record<TranslationKey, string> = {
  "app.name": "PlantHealth",
  "role.question": "क्या आप पौधे उगा रहे हैं, या उनका अध्ययन कर रहे हैं?",
  "role.farmer": "मैं पौधे उगा रहा/रही हूँ",
  "role.lab": "मैं उनका अध्ययन कर रहा/रही हूँ",
  "role.change_hint": "आप इसे कभी भी सेटिंग्स में बदल सकते हैं।",

  "onboarding.skip": "छोड़ें",
  "onboarding.next": "अगला",
  "onboarding.back": "पीछे",
  "onboarding.finish": "पूर्ण",
  "onboarding.step": "चरण {current} / {total}",

  "farmer.q1.title": "आप क्या उगा रहे हैं?",
  "farmer.q2.title": "लगभग कितने पौधे हैं?",
  "farmer.q3.title": "आपके पास कितनी सेंसर यूनिट हैं?",
  "farmer.q3.coverage": "यानी {ratio}",
  "farmer.q4.title": "खेत की बनावट कैसी है?",
  "farmer.q4.rows": "पंक्तियाँ",
  "farmer.q4.grid": "ग्रिड",
  "farmer.q4.rough": "मोटा स्केच",
  "farmer.q5.title": "आप सिंचाई कैसे करते हैं?",
  "farmer.q5.drip": "ड्रिप",
  "farmer.q5.flood": "फ्लड (बाढ़ सिंचाई)",
  "farmer.q5.sprinkler": "स्प्रिंकलर",
  "farmer.q5.rain_fed": "वर्षा-आधारित",
  "farmer.q6.title": "क्या इस ज़मीन में पहले लवणता (नमक) की समस्या रही है?",
  "farmer.q6.yes": "हाँ",
  "farmer.q6.no": "नहीं",
  "farmer.q6.unsure": "पता नहीं",
  "farmer.q7.title": "आप कहाँ हैं?",
  "farmer.q7.region": "क्षेत्र",
  "farmer.q7.season": "मौसम",
  "farmer.q8.title": "आपको कब बताया जाए कि कुछ गड़बड़ है?",
  "farmer.q8.fairly_sure": "केवल जब आप काफी हद तक निश्चित हों",
  "farmer.q8.tell_me_early": "जल्दी बताएं, भले ही यह कुछ न हो",
  "farmer.q9.title": "भाषा",

  "farmer.home.coverage": "कवरेज",
  "farmer.home.verdict.stressed": "यह ब्लॉक पानी की कमी से तनावग्रस्त लग रहा है",
  "farmer.home.verdict.healthy": "यह ब्लॉक स्वस्थ लग रहा है",
  "farmer.home.confidence.fairly_sure": "काफी हद तक निश्चित",
  "farmer.home.confidence.uncertain": "अनिश्चित",
  "farmer.home.confidence.not_sure": "अभी निश्चित नहीं — कुछ घंटों बाद फिर देखें",
  "farmer.home.what_to_do": "मुझे क्या करना चाहिए?",
  "farmer.home.upgrade_for_remedy": "उपचार सलाह देखने के लिए अपग्रेड करें",
  "farmer.home.demo_banner": "डेमो डेटा — यह किसी वास्तविक पौधे से नहीं है",

  "settings.title": "सेटिंग्स",
  "settings.role": "मैं हूँ",
  "settings.language": "भाषा",
  "settings.tier": "योजना",
}

export default hi
