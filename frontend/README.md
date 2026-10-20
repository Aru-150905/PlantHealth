# Frontend

React + Vite + TypeScript + Tailwind v4. Talks to `backend/api/` via `/api` (proxied by Vite
in dev — see `vite.config.ts`).

## Run it

```bash
npm install
npm run dev
```

Requires the backend running at `http://127.0.0.1:8000` (see `backend/api/README.md`) —
`python -m api.seed` first for demo logins.

## Structure

- `src/api/client.ts` — typed fetch wrapper + every backend endpoint the UI calls.
- `src/state/auth.tsx` — auth/tenant/onboarding context. Loads `tenant` and `onboarding`
  **together**, never independently — see
  `~/Desktop/PlantHealth-Decisions/08-frontend-and-bugs-found-by-testing.md` for the bug
  that happens if you don't.
- `src/state/onboardingRouting.ts` — the one place that decides which onboarding wizard (if
  any) an account still needs, given its role. Used by both the route guard and the
  settings-page role switch so they can't disagree.
- `src/i18n/` — `en.ts`/`hi.ts` dictionaries + `useT()`. Farmer-facing and shared strings
  only — the lab flow is deliberately not translated (see `hi.ts`'s header).
- `src/pages/` — `Login`, `Register`, `RoleChoice` (the first-run two-button screen),
  `onboarding/FarmerOnboarding` (9-step wizard), `onboarding/LabOnboarding` (single dense
  form), `FarmerHome` (the full section-6 farmer view — verdict, sentinel field map, trend,
  remedy, all tier-gated and onboarding-driven), `LabHome` (placeholder landing — the full
  signal viewer + confound panel land in step 6), `Settings` (role + language switch).
- `src/components/FieldMap.tsx` — the sentinel field map (section 4): rings fading with
  distance, a live block-size slider, status-colored cells (good/critical/unknown) with an
  icon + legend, never color alone. `TrendChart.tsx` (Premium/Pro) and `TrendSummary.tsx`
  (Basic — plain-language, since a coarse confidence band can't honestly support a precise
  chart) cover section 6's 24h/7d trend.
- `src/components/WaveformViewer.tsx` — section 7's signal viewer: time domain (with an
  `src/lib/fft.ts` radix-2 FFT for the frequency view), pan/zoom, environmental channels as
  a second chart sharing the time axis (never a dual y-axis). `FeatureTable.tsx` (the raw
  feature vector), `ShapPanel.tsx` (Pro — diverging blue/red bars), `ConfoundPanel.tsx`
  (chamber temperature by predicted class, flagging a real detected spread).
- `src/pages/AdminDashboard.tsx` — section 10: model registry, all tenants' usage against
  their tier limits, device fleet health with live artefact-flagging, and a stacked
  prediction-volume-by-class chart. Reachable at `/admin` (linked from Settings); admin-ness
  is enforced server-side only — the page just renders whatever `GET /admin/summary` returns,
  including its own 403 as a plain "no access" message for non-admins.
- `src/App.tsx` — route guards (`Gate` requires a completed onboarding; `RequireAccount` just
  requires login, for the onboarding/settings pages themselves).

## Section 5's "is the fork real" test

`FarmerHome` and `LabHome` are different components with different vocabulary, different
layout, and different data driving them (coverage ratio + watering-based remedy copy vs.
experimental design + confound panel status) — not one component with fields hidden by role.
Verified by hand in a real browser across every seeded tier, not just by code review; see the
decision log entry above for what that testing caught.

## Known gaps (land in later steps)

- Field map / neighbour-inference visualization (step 5), signal viewer + confound panel
  chart (step 6), admin dashboard (step 7) — `FarmerHome`/`LabHome` are real but intentionally
  minimal placeholders for those.
- CSV upload for lab ground-truth assay data is captured as a flag in onboarding but not
  wired to actually upload/process a file yet.
- No frontend test suite yet (Vitest/RTL) — correctness here was verified through the actual
  running app (build + manual browser testing) rather than automated frontend tests; worth
  adding if the UI surface keeps growing.
