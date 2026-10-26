# Farmer-friendly 3D redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the farmer side usable by a non-literate farmer: Hindi/English everywhere,
a 3D plant on the welcome/login screens and the farmer home, a chosen guide character
(Didi/Bhaiya) with read-aloud, and demo irrigation/fertiliser controls. Also de-densify the
lab side and bring the Desktop decision log up to date.

**Architecture:**
- Backend gets two small additions in the existing patterns:
  - a `guide_character` tenant field (plus `language` accepted on register)
  - an `ActuatorAction` table with simulated irrigation/fertiliser endpoints, mirroring
    `AlertLog`
- Frontend:
  - a pure `plantLook()` mapping (API result + tier → visual state) is the honesty core and
    is unit tested
  - a lazy-loaded `Plant3D` (three.js via @react-three/fiber, procedural geometry) renders
    the plant
  - a `Guide` component (inline SVG + speechSynthesis) wraps every farmer screen

**Tech Stack:** FastAPI/SQLAlchemy/pytest; React 19 + Vite 8 + Tailwind 4 + TS 6; new:
`three`, `@react-three/fiber`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-10-26-farmer-friendly-3d-redesign-design.md`

## Global Constraints

- Never auto-actuate. Irrigation and fertiliser start only after an explicit tap **and** a
  confirmation.
- Every actuator surface (button, confirmation, running state, history) is labelled DEMO /
  simulated. Backend rows are `simulated=True`.
- Fertiliser is never suggested by the app.
- Irrigation follows `watering_method`:
  - drip → "Start drip"
  - sprinkler → "Turn on sprinklers"
  - flood → "Open water channel"
  - rain_fed → no irrigation button
- The plant look must not exceed what the tier's API result says:
  - Basic stressed → generic "unwell", never drought/heat/salinity
  - `unknown` → neutral "?" plant
  - "uncertain" band → mild symptoms + "?"
- `hi.ts` stays `Record<TranslationKey, string>` (key-for-key with `en.ts`). Lab-only text
  stays English.
- Hindi: simple everyday Devanagari, not Hinglish. Uncertain terms get listed in the
  decision log.
- Keep existing tokens: `.surface`, `font-display`, toasts, dark mode (every new screen
  works in dark), `.btn-3d`.
- Respect `prefers-reduced-motion` for character and plant animation.
- Demo-data banner and `is_synthetic` labelling unchanged.
- No migrations: schema change means delete `backend/plant_health.db` and re-seed (run.sh
  seeds).
- Git: commit each task to `main`, push to `origin` at the end of each task.

## Review Focus

1. **WebGL unavailable or slow phone:** `Plant3D` must show a static SVG plant, never a
   blank box (Task 4 test: `hasWebGL()` false renders the fallback).
2. **No Hindi voice on device:** the 🔊 button is hidden, never reads Hindi with an English
   voice (Task 6: `pickVoice()` returns null when there's no `hi` voice).
3. **Language chosen before login:** it survives login and is sent on register (Task 3:
   the locale store reads/writes localStorage; Task 1: register stores `language`).
4. **Starting irrigation while one is already running:** the backend rejects a second
   concurrent action of the same kind with 409 (Task 2 test).
5. **Rain-fed farmer with a drought reading:** no irrigation suggestion or button (Task 3
   `irrigationFor('rain_fed')` → null, test).

---

### Task 1: Backend: guide character + language on register

**Files:**
- Modify: `backend/api/models.py` (Tenant: `guide_character: Mapped[str | None]`, nullable)
- Modify: `backend/api/schemas.py`:
  - `TenantOut.guide_character: str | None`
  - `RegisterRequest.language: str = "en"` (min 2, max 10)
  - new `GuideUpdateRequest(guide_character: Literal["didi","bhaiya"])`
- Modify: `backend/api/routers/auth.py` (store `language` on the new Tenant)
- Modify: `backend/api/routers/tenants.py` (`PUT /tenants/me/guide` → TenantOut)
- Test: `backend/tests/test_guide_and_language.py`

**Interfaces:**
- Produces: `PUT /tenants/me/guide {guide_character}` → TenantOut. TenantOut gains
  `guide_character`. Register accepts `language`.

- [ ] Step 1: write the tests:
  - `test_register_stores_language`: register with `language:"hi"` → `GET /tenants/me`
    has `language == "hi"`
  - `test_guide_defaults_to_none_and_can_be_set`: `None` → PUT `"didi"` → `"didi"`
  - `test_guide_rejects_unknown_value`: PUT `"robot"` → 422
- [ ] Step 2: run `cd backend && .venv/bin/pytest tests/test_guide_and_language.py -q`.
  Expect FAIL.
- [ ] Step 3: implement the model, schema and router changes.
- [ ] Step 4: run the full `pytest -q`. Expect all PASS.
- [ ] Step 5: commit "Backend: guide character + language on register".

### Task 2: Backend: simulated actuator actions

**Files:**
- Modify: `backend/api/models.py` (new `ActuatorAction`):
  - id, tenant_id, plant_id
  - kind (`irrigation` | `fertiliser`), method (str | None, the watering method at the time)
  - duration_min (int), started_at, ends_at, stopped_at (nullable)
  - simulated (bool, default True)
- Create: `backend/api/routers/actuators.py`. Docstring states delivery is simulated and
  marks the `_dispatch_to_hardware()` seam, a no-op that returns `simulated=True`.
- Modify: `backend/api/schemas.py`:
  - `ActuatorStartRequest(kind: Literal[...], duration_min: int = Field(ge=1, le=120))`
  - `ActuatorActionOut` (adds `running: bool`, computed as `stopped_at is None and now < ends_at`)
- Modify: `backend/api/main.py` (include the router)
- Test: `backend/tests/test_actuators.py`

**Interfaces:**
- `POST /plants/{plant_id}/actions` → 201 ActuatorActionOut. The `method` field is taken
  from the tenant's farmer profile `watering_method` for irrigation.
- `POST /plants/{plant_id}/actions/{action_id}/stop` → ActuatorActionOut
- `GET /plants/{plant_id}/actions` → list, newest first, limit 50
- Irrigation on a `rain_fed` profile → 400 `{"error":"no_irrigation_for_rain_fed"}`.
  Same kind already running → 409.

- [ ] Step 1: write the tests:
  - `test_start_irrigation_records_simulated_action`: `simulated is True`,
    `running is True`, `method == "drip"` after farmer onboarding with drip
  - `test_stop_marks_not_running`
  - `test_list_newest_first`
  - `test_second_concurrent_same_kind_is_409`
  - `test_rain_fed_irrigation_is_400`
  - `test_other_tenant_cannot_see_or_stop` (404)
  - `test_duration_out_of_range_422` (0 and 121)
  - `test_fertiliser_allowed_on_rain_fed`
- [ ] Step 2: run them. Expect FAIL.
- [ ] Step 3: implement the model, schemas and router. `_get_plant` is the same pattern as
  `routers/field.py`.
- [ ] Step 4: run the full `pytest -q`. Expect all PASS.
- [ ] Step 5: commit "Backend: simulated irrigation/fertiliser actions".

### Task 3: Frontend foundations: vitest, plantLook, irrigation mapping, locale before login, top bar

**Files:**
- Modify: `frontend/package.json`:
  - devDeps `vitest`
  - script `"test": "vitest run"`
  - deps `three`, `@react-three/fiber`, `@types/three` (dev)
- Create: `frontend/src/lib/plantLook.ts` + `plantLook.test.ts`
- Create: `frontend/src/lib/irrigation.ts` + `irrigation.test.ts`
- Create: `frontend/src/state/locale.ts` (`readStoredLocale(): string`,
  `storeLocale(l: string): void`, localStorage key `ph_locale`, try/catch)
- Modify: `frontend/src/main.tsx`:
  - locale = `tenant?.language ?? storedLocale`
  - `onLocaleChange` stores locally always, and calls `api.setLanguage` + `refreshTenant`
    when logged in
- Create: `frontend/src/components/ui/LanguageToggle.tsx` (English | हिन्दी pill)
- Create: `frontend/src/components/ui/TopBar.tsx`
  (`{ right?: ReactNode; showSettings?: boolean }`: app name, LanguageToggle, optional
  settings link)
- Modify: `frontend/src/api/client.ts`:
  - `Tenant.guide_character: "didi" | "bhaiya" | null`
  - `api.register` body gains `language`
  - `api.setGuide(g)`
  - `ActuatorAction` type
  - `api.listActions(plantId)`, `api.startAction(plantId, {kind, duration_min})`,
    `api.stopAction(plantId, id)`
- Modify: `frontend/src/state/auth.tsx` (`register` passes the stored locale)

**Interfaces:**
- `type PlantMood = "healthy" | "unwell" | "drought" | "heat" | "salinity" | "unknown"`
- `plantLook(result: PredictionResult | null): { mood: PlantMood; intensity: number; uncertain: boolean }`
  - `intensity` is in 0..1 and drives symptom strength
  - `unknown`/null → `{mood:"unknown", intensity:0, uncertain:true}`
  - `stressed===false` → healthy, intensity 0
  - stressed with `class_label` null → "unwell"
  - stressed with `class_label` in drought/heat/salinity → that mood
  - intensity: band "fairly sure" → 1, "uncertain" → 0.45. Otherwise, with
    `confidence_pct`: ≥70 → 1, else 0.45. On Pro, `severity` severe → 1,
    moderate → 0.75, mild → 0.45 when present.
  - `uncertain` = (intensity < 1)
- `irrigationFor(method: string | undefined): { labelKey: TranslationKey; icon: string } | null`
  - null for `"rain_fed"`
  - drip → `farmer.act.irrigate.drip` 💧
  - sprinkler → `farmer.act.irrigate.sprinkler` 💦
  - flood → `farmer.act.irrigate.flood` 🌊
  - undefined → treated as drip

- [ ] Step 1: write the `plantLook.test.ts` cases:
  - unknown result → unknown
  - healthy
  - basic stressed (class null, band "fairly sure") → unwell, intensity 1
  - drought, band "uncertain" → drought, 0.45, uncertain true
  - heat with confidence_pct 90 → 1
  - salinity with severity "moderate" → 0.75
- [ ] Step 2: write the `irrigation.test.ts` cases: all four methods, plus undefined → drip.
- [ ] Step 3: `npm i` the deps, then `npm test`. Expect FAIL (modules missing).
- [ ] Step 4: implement `plantLook`, `irrigation`, the locale store, the toggle, the top bar,
  and the client/auth changes. Add the i18n keys used so far to `en.ts` and `hi.ts`.
- [ ] Step 5: `npm test` and `npm run build`. Expect PASS.
- [ ] Step 6: commit "Frontend foundations: plantLook, irrigation mapping, pre-login locale".

### Task 4: Plant3D

**Files:**
- Create: `frontend/src/components/plant/Plant3D.tsx`. Default export, lazy-loaded via
  `React.lazy` by `PlantStage`.
- Create: `frontend/src/components/plant/PlantStage.tsx`:
  - `{ look: ReturnType<typeof plantLook>; size?: "hero" | "card"; interactive?: boolean }`
  - renders `Suspense` with a `PlantFallback` while loading, or when `!hasWebGL()`
  - overlays a floating "?" badge when `look.uncertain`
- Create: `frontend/src/components/plant/PlantFallback.tsx` (static SVG tomato plant, tinted
  per mood)
- Create: `frontend/src/lib/webgl.ts` (`hasWebGL(): boolean`) + test (jsdom without a
  WebGL context → false; set `environment: "jsdom"` only for that file via a comment
  pragma, devDep `jsdom`)

**Procedural model (decisions):**
- Built from three primitives: a terracotta pot (`LatheGeometry`), soil disc, curved stem
  (`TubeGeometry` along a `CatmullRomCurve3`), ~8 leaves (scaled/bent `SphereGeometry`
  halves), and 3 tomatoes (spheres, red).
- Mood → parameters, each lerped by `intensity` from healthy:

  | mood | leaf colour | droop angle (+rad) | soil | extras |
  |---|---|---|---|---|
  | healthy | #3f9a2f | 0 | #5b3a1e | red fruit |
  | unwell | #7d9a3a | 0.35 | — | — |
  | drought | #b8a43a | 0.8 | cracked #8a6a45 | leaves curl (scale y 0.6) |
  | heat | — | 0.4 | — | leaf-edge scorch via vertex colours #7a3b12, warm hemisphere light |
  | salinity | #a8b04a | 0.3 | white crust ring #f1efe6 | — |
  | unknown | greyed #8f9a88 | 0 | — | — |

- Gentle sway (`useFrame`, sin, amplitude 0.03 rad; zero when reduced motion).
- Drag-to-spin via pointer events on the canvas (no OrbitControls, so no extra dep), with
  slow auto-rotate when idle.
- Canvas `dpr={[1, 1.75]}`, `frameloop="always"` only while visible
  (IntersectionObserver → `"never"` off-screen).

- [ ] Step 1: write `webgl.test.ts`. Run it and expect FAIL.
- [ ] Step 2: implement the files above.
- [ ] Step 3: `npm test && npm run build`. Expect PASS, and the build output shows a
  separate chunk for Plant3D.
- [ ] Step 4: commit "Plant3D: procedural 3D tomato plant with honest mood mapping".

### Task 5: Welcome, Login and Register, translated

**Files:**
- Create: `frontend/src/pages/Welcome.tsx` (route `/welcome`): TopBar, hero `PlantStage`
  (healthy, interactive), tagline, Get started → `/register`, Log in → `/login`
- Modify: `App.tsx`:
  - unauthenticated `Navigate` targets become `/welcome` (Gate and RequireAccount)
  - add the `/welcome` route
  - translate "Loading…"
- Modify: `Login.tsx` and `Register.tsx`:
  - TopBar, card-sized healthy plant beside/above the form (side-by-side ≥ md, stacked on
    phones)
  - every string through `t()`
  - big inputs (py-3, text-lg)
  - demo-logins hint kept
- Modify: `en.ts`/`hi.ts` (`welcome.*`, `auth.*` keys)

- [ ] Step 1: implement.
- [ ] Step 2: `npm run build && npm run lint`. Expect PASS.
- [ ] Step 3: commit and push.

### Task 6: Guide character, read-aloud, guide picker

**Files:**
- Create: `frontend/src/components/guide/GuideAvatar.tsx`
  - `{ who: "didi"|"bhaiya"; mood?: "idle"|"nod"|"point"|"happy"|"concern"; size?: number }`
  - layered inline SVG with CSS keyframe animations (blink, idle sway, nod, point)
  - respects reduced motion
- Create: `frontend/src/components/guide/Guide.tsx`
  - `{ text: string; mood?; className? }`
  - reads `tenant.guide_character` (default "didi")
  - speech bubble plus the 🔊 button
- Create: `frontend/src/lib/speech.ts` + `speech.test.ts`
  - `pickVoice(voices: SpeechSynthesisVoice[], locale: string): SpeechSynthesisVoice | null`
    matches `voice.lang` prefix `hi` / `en`, preferring `-IN`
  - `speak(text, locale): boolean`
  - test: no `hi` voice → null; `en-US` + `en-IN` → `en-IN`
- Create: `frontend/src/pages/GuidePicker.tsx` (route `/guide`)
  - two big avatar buttons, each with a one-line intro bubble
  - saves via `api.setGuide`, then `refreshTenant`
  - continues to `?next=` or `/onboarding/farmer`
- Modify: `RoleChoice.tsx`
  - farmer or both → `/guide?next=/onboarding/farmer`
  - TopBar, all strings `t()`
- Modify: `App.tsx` Gate: role farmer/both and `guide_character` null → `/guide?next=<current path>`
- Modify: `Settings.tsx`: "Your helper" section to switch the guide

- [ ] Step 1: write `speech.test.ts`. Run it and expect FAIL.
- [ ] Step 2: implement.
- [ ] Step 3: `npm test && npm run build`. Expect PASS.
- [ ] Step 4: commit and push.

### Task 7: Farmer onboarding, literacy-friendly

**Files:**
- Modify: `frontend/src/pages/onboarding/FarmerOnboarding.tsx`:
  - each step: `<Guide text={t("guide.q{n}")} />`, picture choices using `.btn-3d`-style
    pressable tiles, dot progress
  - Create: `frontend/src/components/ui/Stepper.tsx`
    (`{value:number; onChange; min; max; step; bigStep?}`, − / + with long-press repeat)
    used for plant count, sensor count, rows, spacing
  - region: a select of Indian states + UTs (bilingual list in `src/lib/regions.ts`) plus
    "Other"
  - season: kharif / rabi / zaid / all-year tiles. Stored values stay strings (English
    codes: "kharif" etc.)
  - Q9 pre-selects the current locale
  - every string `t()`, including the coverage preview and the other-crop warning
- Modify: `en.ts`/`hi.ts` (`guide.q1`…`guide.q9`, `farmer.q*` additions)

- [ ] Step 1: implement.
- [ ] Step 2: `npm run build && npm run lint`. Expect PASS.
- [ ] Step 3: commit and push.

### Task 8: Farmer home: plant, guide, actions, readable field, trend

**Files:**
- Modify: `frontend/src/pages/FarmerHome.tsx`:
  - top: TopBar (settings), demo banner
  - hero: `PlantStage look={plantLook(result)}`, a large verdict line per mood (i18n), the
    confidence word / % as today, "updated …" via an i18n `timeAgo`
  - `Guide` with mood-specific advice:
    - drought → per-method watering advice (`farmer.advice.drought.{method}`)
    - heat → `farmer.advice.heat`
    - salinity → `farmer.advice.salinity`
    - unwell → `farmer.advice.unwell`
    - healthy → `farmer.advice.healthy`
    - unknown → existing copy
  - remedy tier gating unchanged: Basic sees `upgrade_for_remedy` instead of
    class-specific advice
  - timeline: an i18n key per class, replacing the backend's English `estimated_timeline`
    (`farmer.timeline.{class}`); severity word translated
- Create: `frontend/src/components/farmer/ActionPanel.tsx`
  - `{ plantId: string; method?: string; suggestIrrigation: boolean }`
  - irrigation button (from `irrigationFor`, hidden for rain-fed) and fertiliser button
  - duration presets 10/20/30 min
  - confirmation sheet with a DEMO badge
  - running card with countdown + Stop
  - "What was switched on" history (from `api.listActions`)
  - `suggestIrrigation` (true only when mood is drought) shows the guide-styled suggestion
    "Start drip for 20 min?" that opens the same confirmation
- Create: `frontend/src/components/farmer/FieldRows.tsx` (`{ cells: FieldCell[] }`)
  - rings rendered as rows of small SVG plant icons
  - sensor plant badge 📡
  - opacity by ring as today
  - cells whose `is_unknown` is true show "?"
  - no ×N badges
  - block-size control: `Stepper` labelled `farmer.field.block_question` ("How many plants
    does this one sensor look after?") with the existing `changeBlockSize`
- `TrendSummary` strings into i18n. `TrendChart` stays for Premium/Pro.
- The coverage card, tier footer and cap notice all go through i18n.

- [ ] Step 1: implement.
- [ ] Step 2: `npm test && npm run build && npm run lint`. Expect PASS.
- [ ] Step 3: commit and push.

### Task 9: Lab view less dense + Settings polish

**Files:**
- Modify: `frontend/src/pages/LabHome.tsx`:
  - TopBar
  - card `PlantStage` + verdict always visible at the top
  - sections into tabs (`Signal` | `Features` | `Explain (SHAP)` | `Confounds` | `Export`),
    tab state in the URL hash
  - existing components reused unchanged
- Create: `frontend/src/components/ui/Explainer.tsx` (`{ term: string; children }`, a "?"
  button toggling a one-sentence popover). Used next to: SHAP, Hjorth mobility/complexity,
  calibrated p, confound, leave-one-plant-out, crest factor, wavelet energy. Text in
  English, inline.
- Modify: `Settings.tsx`: TopBar, all farmer/shared strings `t()`, guide switch (Task 6)

- [ ] Step 1: implement.
- [ ] Step 2: `npm run build && npm run lint`. Expect PASS.
- [ ] Step 3: commit and push.

### Task 10: Decision log

**Files (outside the repo, `~/Desktop/PlantHealth-Decisions/`):**
- Create `14-frontend-visual-overhaul.md` (commit 7119aca)
- Create `15-ground-truth-alerts-export-seed-fix.md` (e64bd81, 89a8cd6)
- Create `16-literacy-first-redesign.md`: owner quotes, the reframing, Hindi everywhere,
  the pre-login locale, the welcome page
- Create `17-3d-plant.md`: tech choice + alternatives (CSS pseudo-3D, Lottie/video,
  pre-rendered images, glTF vs procedural, Babylon.js, model-viewer), the honest mood
  mapping, intensity scaling, the fallback
- Create `18-guide-character.md`: why a person, why the farmer picks, speechSynthesis vs
  recorded audio vs a cloud TTS, device limits
- Create `19-demo-actuators.md`: why demo, confirm-not-auto, method-aware irrigation,
  fertiliser never suggested, real-hardware options later (ESP32/relay, commercial smart
  controllers, LoRaWAN, GSM/SMS relays), safety
- Create `20-field-map-and-lab-density.md`: the ×N confusion, why block size was kept, lab
  tabs + explainers
- Create `21-hindi-terms-and-advice-for-review.md`: every uncertain Hindi term and the
  heat/salinity advice, for the owner to check
- Modify `README.md` (index)

- [ ] Step 1: read the commits (`git show --stat`) for 14/15 and write from the code, not
  memory.
- [ ] Step 2: write 16–21 citing the commits from Tasks 1–9.
- [ ] Step 3: update the README index.

### Task 11: Verify end to end and run

- [ ] `cd backend && .venv/bin/pytest -q`: all pass.
- [ ] `cd frontend && npm test && npm run build && npm run lint`: pass.
- [ ] Delete `backend/plant_health.db`, run `./run.sh`, confirm the seed + servers start.
- [ ] Browser (DevTools emulation at 390×844 and desktop):
  - welcome → register → guide → role → onboarding → farmer home, in हिन्दी and English,
    light and dark
  - basic/premium/pro demo logins: check the plant mood and the advice match the tier
  - irrigation start/stop and history; rain-fed hides it
  - lab tabs
- [ ] Push. Leave the app running for the owner.
