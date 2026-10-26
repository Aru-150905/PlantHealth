# Farmer-friendly 3D redesign: design

**Date:** 2026-10-26 · **Repo:** `~/Desktop/PlantHealth` (`Aru-150905/PlantHealth`)
**Decision log (outside the repo):** `~/Desktop/PlantHealth-Decisions/`

## 1. Intent: why this exists

The owner looked at the running app and found it "very basic… plain". The deeper problem
they named: **the farmers using this are not technically literate.** The interface has to
be usable by someone who reads little or no English, may read Hindi slowly or not at all,
and is holding a phone in a field. "Feature rich" here means *more help and more ability to
act*, not more numbers.

Concrete evidence from the owner: they couldn't work out the field-map block-size slider
themselves ("if I increase it, it becomes 64× — what is that about?"). If the project owner
can't read a screen, a farmer can't.

The owner also wants the app to *do* something about a bad reading: turn on sprinklers when
the plant is thirsty, and give fertiliser, from inside the app.

The owner's one success criterion, verbatim: **"don't get anything wrong."** Treat accuracy
(of the UI's claims, of the Hindi, of the docs) as the bar.

## 2. Goals

1. **Farmer side usable by a non-literate farmer**, in Hindi or English, on phone and
   desktop browsers.
2. **A 3D tomato plant** on the login/welcome screens (decorative, always healthy) **and**
   on the farmer home after sign-in (where it shows the actual reading).
3. **A guide character** on every farmer screen after sign-up, explaining what to do in
   plain words, with read-aloud. The farmer **chooses their guide** once (option C from the
   mockups): "Didi" (a village woman in a saree) or "Bhaiya" (an experienced farmer with a
   pagdi). It can be changed in Settings.
4. **Sprinkler and fertiliser controls** in the farmer home, as a **clearly labelled demo**
   (no real hardware exists), built so real valve/pump hardware can be wired in later.
5. **Hindi/English toggle visible on every screen**, including before login.
6. **Lab side: "not as beginner friendly as the farmer, but slightly less dense"** (owner's
   words).
7. **Decision log on the Desktop brought fully up to date:** everything done so far,
   including the undocumented 2026-10-21 work, plus this redesign, each with valid reasons
   and the alternatives considered.

## 3. Non-goals

- Real hardware control. No relay/valve/pump code talks to anything physical.
- Detecting nutrient deficiency. The model knows exactly four classes
  (healthy/drought/heat/salinity) and this work does not add a fifth.
- Translating the lab view into Hindi. `frontend/src/i18n/hi.ts`'s header documents this
  as a deliberate earlier choice (lab wording is precise and jargon-forward); keep it.
- Changing the ML model, tier limits, or any backend honesty rule.
- Deployment / hosting.

## 4. Anti-goals: things that make this a failure even if it "works"

- **The plant or guide claiming more than the model knows.** Examples: a Basic-tier plant
  drawn as specifically "drought" when Basic only receives stressed/not-stressed. The app
  suggesting fertiliser as if it detected a nutrient problem. A confident-looking plant when
  the result is `unknown`. Every visual state must map to what the API actually returned for
  that tier (see §6.4).
- **The demo controls looking real.** A farmer must never believe water is actually flowing.
  Every control, confirmation and history entry carries a "demo / simulated" label, the same
  way synthetic data is labelled everywhere today.
- **Automatic actuation.** The app never turns anything on by itself. At most it *suggests*
  ("Turn on sprinklers for 20 min?") and waits for the farmer's explicit tap plus a
  confirmation.
- **Wrong or machine-garbled Hindi.** Strings must be natural, simple Hindi (Devanagari) at
  a low reading level. See §7.
- **3D that makes the app unusable on a cheap Android phone** (slow load, jank, battery
  drain, a blank screen where WebGL is unavailable).
- **Breaking existing behaviour:** the tier gating, the honesty floor (`unknown` state),
  the demo-data banner, onboarding routing for "both" accounts, the existing backend tests.
- **Removing the block-size control outright.** The original brief (section 4,
  `~/Desktop/PlantHealth-Decisions/00-brief.md`) requires "let the user set the block size
  and watch the inferred confidence change". It gets rewritten in plain language, not
  deleted (see §6.5).

## 5. Constraints (from the existing project)

- Frontend: React 19, Vite 8, Tailwind 4, TypeScript 6, react-router 7, recharts.
  No frontend test runner exists today.
- Backend: FastAPI + SQLAlchemy + SQLite, **no migrations**. Schema changes mean
  delete `backend/plant_health.db` and re-run `python -m api.seed` (documented in
  `07-fastapi-backend.md`). Python 3.12, `backend/.venv`.
- One-command run via `./run.sh` must keep working.
- Existing design tokens to keep (from the 2026-10-21 overhaul): class-based dark mode
  (`state/theme.tsx`), `.surface` elevation class, `font-display` (Fraunces), toasts
  (`components/ui/Toast.tsx`), skeletons, inline-SVG icons (`components/ui/Icon.tsx`),
  `.btn-3d`. The 3D/pressable look now spreads beyond the role screen, by the owner's request.
- i18n: `frontend/src/i18n/{en,hi,index}.tsx`. `hi.ts` must match `en.ts` key-for-key
  (typed as `Record<TranslationKey, string>`). Locale currently comes only from
  `tenant.language`, so **before login it is always English**. That must change.
- All synthetic data stays labelled `is_synthetic` / demo banner.

## 6. What gets built: the parts the owner decided

### 6.1 Language everywhere

- A compact **English | हिन्दी** toggle in the top bar of **every** screen: login,
  register, role choice, onboarding, farmer home, lab home, settings.
- Before login the choice persists in `localStorage`. On register it is sent as the
  tenant's initial language. After login `tenant.language` stays the source of truth
  (existing `api.setLanguage`).
- Every farmer-facing and shared string moves into `en.ts`/`hi.ts`. Known hardcoded English
  today includes, non-exhaustively:
  - `Login.tsx` and `Register.tsx`: all of it
  - `FarmerHome.tsx`: `WATERING_REMEDY`, "Not sure yet", "… stress suspected", "Updated …
    ago" (`timeAgo`), "Severity", the general-guidance line, the coverage subtitle, the tier
    footer, the cap notice, toasts
  - `FarmerOnboarding.tsx`: "Tomato", "Other crop", the other-crop warning, the slider
    placeholder, `coveragePreview`'s "1 sensor per N plants", the rows/spacing placeholders
  - `FieldMap.tsx`: legend and block-size text
  - `TrendSummary.tsx`
  - `Settings.tsx`: everything not already keyed
  - `Gate`/`RequireAccount` "Loading…"

  The builder must grep for every remaining literal on farmer/shared screens. Lab-only
  screens stay English.

### 6.2 3D plant: one component, two uses

A single `Plant3D` component, used in two places:

- **Welcome/login/register:** a large, gently swaying tomato plant (green leaves, red
  fruit, terracotta pot) that the user can **drag to spin**. Always healthy and purely
  decorative. It never implies a reading.
- **Farmer home:** the same plant, its appearance driven by the reading (mapping in §6.4).
  Also spinnable.

Also introduce a **welcome page** in front of login. Today `/login` is the first thing
anyone sees. The welcome page shows the big plant, a one-line promise, and two large
buttons: Get started → register, and Log in. The language toggle sits on it too.

### 6.3 Guide character (Didi / Bhaiya)

- **Picking:** shown once right after sign-up, before (or as) the role question for anyone
  who goes the farmer route. Two big tappable characters, the guide-to-be speaking a
  one-line intro. Stored on the tenant (new field, e.g. `guide_character`:
  `"didi" | "bhaiya"`, nullable until chosen). Changeable in Settings.
- **Where it appears:** every farmer onboarding step and the farmer home. *Not* on the lab
  side.
- **What it does:**
  - A speech bubble with one or two short sentences: what this screen is asking, or what
    the reading means and what to do.
  - A 🔊 read-aloud button using the browser's built-in `speechSynthesis`, in `hi-IN` or
    `en-IN` to match the locale. If no matching voice exists on the device, **hide the
    button** rather than reading Hindi with an English voice.
  - Small reactions (idle sway/blink, nod when an option is picked, point toward the
    Next button). They must respect `prefers-reduced-motion`.
- The characters must look properly illustrated: warm, respectful, not caricatured. The
  brainstorm sketches (in `.superpowers/brainstorm/`) were rough placeholders for
  direction only.

### 6.4 What the farmer-home plant shows: an honest mapping

The plant's look must follow exactly what the API returned **for this tenant's tier**:

| API result | Plant look | Guide says (gist) |
|---|---|---|
| `unknown: true` | neutral plant, slightly faded, a floating "?" | "Not sure yet, check again in a few hours" (existing copy) |
| healthy (any tier) | upright, rich green, red fruit | "Your plants look healthy" |
| stressed, **Basic** (no class label) | generic "unwell": slight droop, dulled colour. **Not** drought-specific | "Something looks wrong in this block" |
| `class_label = drought` | drooping, yellowing, curled leaves, dry cracked soil | "Your plants look thirsty" + watering advice |
| `class_label = heat` | leaf edges scorched brown, slight droop, warm haze | heat-specific advice |
| `class_label = salinity` | leaf-edge yellowing, white salt crust on the soil | salinity-specific advice |

Confidence words ("fairly sure / uncertain") and the exact % (Premium+) stay shown in
text, exactly as today's tier gating allows. The demo-data banner stays.

### 6.5 Field view: replace the "×64" map with something a farmer can read

The owner didn't understand `FieldMap`'s ×N group badges or the block-size slider.

- Farmer view: draw the block as **rows of small plants** that get **paler, and finally
  become "?"**, the further they are from the sensor plant (marked with a sensor icon). No
  "×N" badges.
- Keep the block-size control (required by the brief), reworded in plain language, for
  example "How many plants does this one sensor look after?", as a big − / + stepper or a
  slider with a picture-scale label. Changing it visibly makes the far plants fade further.
- Lab view keeps the existing detailed `FieldMap` behaviour (or equivalent) since
  researchers want the precise version.

### 6.6 Sprinkler and fertiliser controls (demo)

- On farmer home, under the plant and guide: two big buttons, **💦 Turn on sprinklers** and
  **🧪 Give fertiliser**, each with a duration picker (simple presets such as 10 / 20 / 30
  min; the exact set is the builder's call).
- Tapping opens a confirmation sheet ("Turn on sprinklers for 20 minutes?", clearly marked
  DEMO, nothing physical happens). On confirm, a running state with a countdown and a
  **Stop** button.
- **Suggestions:** when the result is `class_label = drought`, the guide *suggests* the
  sprinkler ("Turn on sprinklers for 20 min?"). It never auto-starts. Fertiliser is
  **never suggested by the model**, since it can't detect nutrient problems. It is always
  available as a manual action.
- **History:** a "What was switched on" list (time, what, how long, who/simulated).
- **Backend:** a new table and endpoints, mirroring the `AlertLog` pattern
  (`routers/alerts.py`): every action stored with `simulated=True`, and an obvious seam
  where a real hardware call would go later. Suggested shape:
  - model `ActuatorAction`: id, tenant_id, plant_id, kind (`sprinkler` | `fertiliser`),
    duration_min, started_at, ends_at, stopped_at (nullable), simulated
  - `POST /plants/{plant_id}/actions`, `POST /plants/{plant_id}/actions/{id}/stop`,
    `GET /plants/{plant_id}/actions`
  - tenant-isolated like every other plant endpoint
- **Tiers:** available on all tiers (it's a demo). Recorded here as a decision so it isn't
  mistaken for an oversight.
- Backend tests in the existing style (`backend/tests/`, real HTTP via the test client):
  create, list, stop, cross-tenant isolation, validation of kind/duration.

### 6.7 Farmer onboarding: same 9 questions, made literacy-friendly

The questions and stored profile stay the same (backend schema unchanged). Presentation
changes:

- The guide asks each question in its bubble (read-aloud available).
- Picture buttons for every choice question (crop, layout, watering, salinity, alerts,
  language), using the pressable 3D button style.
- No bare number boxes: plant count, sensor count, rows and spacing become big − / +
  steppers with picture hints. Region and season become pick lists (Indian states / the
  three Indian seasons: kharif, rabi, zaid, in Hindi + English) rather than free text.
  *Check this against the existing schema: `region`/`season` are strings, so stored values
  can stay strings.*
- A progress bar of dots instead of "Step 5 of 9".
- Language (Q9) is pre-filled from the toggle already chosen, so it's effectively a
  confirmation.

### 6.8 Lab side: "slightly less dense"

- **No guide character.** Same top bar (language toggle) and the same `Plant3D` at the top,
  showing the predicted state (lab always gets the class label per its tier).
- The long single scroll (summary stats, verdict, waveform, features, SHAP, confound panel)
  gets organised into **tabs or collapsible sections**, with the verdict always visible.
- A small **"?" explainer** next to each technical term (SHAP, Hjorth mobility, calibrated
  p, confound, LOPO, etc.): tap for a one-sentence plain explanation.
- Everything currently shown stays reachable. Nothing is removed for researchers.
- Lab text stays English (§3).

### 6.9 Look and feel across the app

The owner asked for it to "look 3D… very interactive". Spread depth deliberately:
pressable 3D buttons for primary actions, layered card depth via the existing `.surface`,
the plant, and subtle motion. Keep it coherent and calm, not scattered effects, and keep
the dark mode working on every new screen.

## 7. Hindi quality

- Plain, everyday Hindi at a low reading level. Short sentences, common words
  ("पानी", "खाद", "पौधे प्यासे हैं"), Devanagari script, not Hinglish.
- Keep consistency with the existing `hi.ts` vocabulary where it's already good.
- The builder should flag any string where the right Hindi agricultural term is uncertain,
  for the owner to check, rather than guessing silently. List them in the decision doc.

## 8. Decision log (Desktop) deliverables

Follow the existing format exactly (see any of `01`–`13`: title, **Date** and **Code**
line, then one `##` section per decision with what was chosen, **why**, and **what else was
considered and why it lost**). The owner explicitly wants valid reasons plus the
alternatives available.

1. **Backfill the 2026-10-21 work** that has no entry (reconstruct from commits `7119aca`,
   `e64bd81`, `89a8cd6` and the code):
   - `14-frontend-visual-overhaul.md`: dark mode, `.surface` depth, Fraunces, toasts,
     skeletons, icon set, `.btn-3d`.
   - `15-ground-truth-alerts-export-seed-fix.md`: ground-truth CSV upload, alert history
     log, farmer trend CSV export, `errorMessage()`, the seed-idempotency fix.
2. **This redesign**, one file per meaningful decision or a few grouped files, numbered
   from `16`. At minimum: the literacy-first reframing; Hindi everywhere and the pre-login
   locale; the guide character and why the farmer picks; 3D technology choice (with
   alternatives such as CSS-only pseudo-3D, Lottie/video, pre-rendered images, a loaded
   glTF model vs. a procedural one); the honest plant-state mapping; the field-map rewrite
   and why block size was kept; demo actuators (why demo, why confirm-not-auto, why
   fertiliser is never suggested, real-hardware options for later such as ESP32 + relay,
   commercial smart controllers, LoRa for fields without Wi-Fi); the lab de-densifying; the
   read-aloud approach and its device limits.
3. Update `README.md`'s index in that folder.
4. Also include the brainstorming conversation's key owner statements (the quotes in §1–2)
   in the redesign entry, so the "why" is traceable to the owner.

## 9. Verification expected before calling it done

- `npm run build` (includes `tsc -b`) and `npm run lint` pass.
- `pytest` in `backend/` passes, including new actuator tests.
- Real-browser check of every changed screen at **phone width (~390px)** and desktop, in
  **both** languages, light and dark. Note that `09-farmer-view-and-sentinel.md` records the
  Chrome extension's `resize_window` not changing screenshot size, so use DevTools device
  emulation (chrome-devtools MCP `emulate`/`resize_page`) or Playwright `browser_resize`.
- Check each §6.4 plant state renders, using the three demo tenants (basic/premium/pro
  @demo.planthealth) and whatever states the synthetic demo plants produce. If some state
  (e.g. heat) never occurs in demo data, verify it with a dev-only override, not by
  changing demo data.
- WebGL-unavailable fallback shows a static plant, not a blank box.
- `./run.sh` still works from a fresh DB (the schema changed).

## 9a. Calls made after the builder check (Claude's calls, not the owner's; owner to review)

1. **The water control adapts to how the farmer waters** (onboarding Q5,
   `watering_method`). The owner said "sprinklers", but offering sprinklers to a drip
   farmer would be a wrong claim:
   - drip → "💧 Start drip"
   - sprinkler → "💦 Turn on sprinklers"
   - flood → "🌊 Open water channel"
   - rain-fed → no water button. The guide explains there's no irrigation to switch on.

   `ActuatorAction.kind` is therefore `irrigation | fertiliser`, with the irrigation method
   recorded on the row. The drought suggestion uses the same per-method wording.
2. **Heat and salinity advice is written by the builder** as short, general, widely
   accepted guidance. Examples: heat → water in early morning/evening, shade during the
   hottest hours; salinity → water with good-quality (non-salty) water to flush the root
   zone, get a soil test before adding anything. It is always under the existing "General
   guidance only, not a diagnosis" line and listed in the decision log **for owner review**,
   like uncertain Hindi terms. It lives in `en.ts`/`hi.ts` next to the existing
   watering-method advice.
3. **Plant symptoms scale with confidence, not just class.** "Fairly sure" (or high exact
   %) → full symptoms. "Uncertain" (or low %) → mild symptoms plus a small "?" badge, and
   the guide says "might be…". `unknown` → the neutral "?" plant. On Pro, `severity` may
   further scale symptom strength. One rule, applied the same way on every tier, from the
   coarse band (which every tier receives).

## 9b. Git (owner's decision)

Same as every earlier build step: commit each part to `main` and push to
`origin` (`Aru-150905/PlantHealth`). After the build, run the app (`./run.sh`) for the owner
to try.

## 10. Left to the builder

- 3D library and how the plant is modelled. Recommendation (my call, not the owner's):
  `three` + `@react-three/fiber`, the plant built procedurally in code (no external model
  file), code-split so only screens with a plant load it, with a static SVG/PNG fallback.
- How the guide characters are drawn and animated (layered inline SVG with CSS/JS
  animation is the expected route, with no external asset hosts).
- Exact component structure, file names, route names (e.g. `/welcome`), and where the
  guide picker sits relative to the role question.
- Duration presets, exact copy (within §7's rules), animation details.
- Whether lab sections are tabs or accordions.
