# PlantHealth — plant stress monitoring platform

A full-stack plant stress monitoring platform: synthetic leaf-electrophysiology data, an
ML pipeline that classifies plant state (healthy / drought / heat / salinity) with a
calibrated confidence score, and a web app forked between a farmer-facing field view and a
lab-facing research view, built around the **sentinel** concept — one instrumented plant's
reading extrapolated, with decaying confidence, to its uninstrumented neighbours.

**All shipped data is synthetic.** See `backend/data/README.md` for exactly what's modeled,
what's invented, and why no real public dataset could be used instead. Every synthetic
record/response/UI view is labelled as such — look for `is_synthetic` / the demo-data banner.

Built in the order laid out in the project brief, each step committed separately so the
history shows what worked at each stage. Status below.

## Build status

- [x] **1. Synthetic data generator + sanity-check notebook** — `backend/data/synthetic.py`,
      `notebooks/01_synthetic_data_sanity_check.ipynb`
- [x] **2. Feature extraction + XGBoost + leave-one-plant-out CV** — `backend/ml/`. Honest
      leave-one-plant-out accuracy 81.1% (30-min windows) vs. an inflated random-split number
      of 89.2% — see `backend/ml/README.md` for the full report, the MiniRocket-like
      comparison, calibration, and a genuine confound finding the SHAP analysis caught
      (environment features alone add +20 honest accuracy points — see
      "Confound finding" in that README).
- [x] **3. FastAPI backend: auth, tenants, tier enforcement** — `backend/api/`. JWT auth,
      multi-tenant isolation, every section-9 tier limit enforced server-side (tested over
      the real HTTP API, not just unit-tested), gated prediction endpoint backed by the
      step-2 model, a live-streaming WebSocket, and a seed script with demo tenants on every
      tier. See `backend/api/README.md`.
- [x] **4. Role fork + both onboarding flows** — `frontend/` + `backend/api/routers/tenants.py`.
      The first-run two-button screen, the 9-step farmer wizard, the single dense lab form,
      a Hindi/English i18n layer for the farmer-facing UI, and settings-page role/language
      switching (including "both" role support). Answers are persisted server-side and
      actually drive different behavior (coverage ratio, watering-based remedy copy,
      confound-panel-enabled flag, vocabulary) — verified end to end in a real browser
      across every seeded tier. That testing caught and fixed 5 real bugs (tier-limit
      handling, a React StrictMode double-invoke issue, "both"-role onboarding routing, a
      login request-encoding bug, and an account-switch race condition) — see
      `frontend/README.md` and the decision log.
- [x] **5. Farmer view** — the full section-6 experience: big immediate verdict with a
      plain-language certainty word, the sentinel field map (`backend/api/sentinel.py` +
      `frontend/src/components/FieldMap.tsx`) with confidence that visibly decays by
      distance and a live block-size slider, a 24h/7d trend (a real chart for Premium/Pro,
      an honest plain-language summary for Basic — never a precise-looking chart from a
      coarse band), tier-gated remedy copy. Building this surfaced and fixed a real
      consistency bug (predict/trend/field independently regenerating synthetic data at
      different durations, silently disagreeing on "now") — see
      `~/Desktop/PlantHealth-Decisions/09-farmer-view-and-sentinel.md`. 34 backend tests.
- [x] **6. Lab view + confound panel** — the full section-7 experience: a waveform viewer
      (time domain, frequency domain via a client-side FFT, pan/zoom, environmental
      channels on a second chart — never a dual y-axis), the computed feature table, a SHAP
      explanation panel (Pro), raw CSV export (Premium/Pro), and the confound panel —
      which recomputes step 2's confound finding live, per tenant, from real predictions
      over the real API, and correctly flagged it again on a 12-plant test tenant. See
      `~/Desktop/PlantHealth-Decisions/10-lab-view-and-confound-panel.md`. 41 backend tests.
- [x] **7. Admin dashboard** — the full section-10 experience: a model registry showing the
      real honest leave-one-plant-out accuracy and confound ablation, every tenant's usage
      against their tier's limits, device fleet health, live cross-tenant device
      artefact-flagging, and a stacked prediction-volume-by-class chart — all verified in a
      real browser (flagged a device live, watched a prediction appear in the volume chart
      after making it from another account). See
      `~/Desktop/PlantHealth-Decisions/11-admin-dashboard.md`. 47 backend tests.
- [x] **8. Tier gating end to end + demo-data banner** — a row-by-row audit against
      section 9's full table (not just re-checking what steps 3-7 already enforced) found 3
      real gaps: Pro's "calibration curve" was indistinguishable from a probability vector
      (now serves the actual reliability diagram from step 2's training run), "severity and
      timeline" on diagnoses didn't exist anywhere (now computed and shown on both farmer
      and lab views), and alerts were entirely unbuilt (now a tier-gated preference +
      honestly-simulated test-send — delivery is stubbed, same reasoning as the brief's
      "stub the billing," with every response saying plainly that nothing was actually
      sent). Fixing the calibration curve also caught a real bug (`<img src>` can't carry
      the auth header — fixed with an authenticated blob fetch). The demo-data banner is
      unconditional on every data-bearing view. Added `run.sh` for the brief's "everything
      runs locally with one command." See
      `~/Desktop/PlantHealth-Decisions/12-step8-tier-gating-audit.md`. 53 backend tests.

**The full build order is complete.** All 8 steps shipped, each committed and pushed
separately, each with its own decision-log writeup of what was built and why. See
`~/Desktop/PlantHealth-Decisions/` for the complete build journal.

## Repo layout

```
backend/
  api/      FastAPI app: auth, tenants, tiers, predictions, admin
  ml/       feature extraction, training, leave-one-plant-out validation, SHAP, calibration
  data/     synthetic.py (generator) + generated/ (gitignored output) + README (the science)
  tests/
frontend/   React + Vite + Tailwind + Recharts, role-forked UI
docs/       architecture notes that belong in the repo (not the external decision log)
notebooks/  exploratory / sanity-check notebooks
```

The **decision log** — every non-obvious call made while building this, and why — lives
outside the repo, on the machine this was built on, at `~/Desktop/PlantHealth-Decisions/`.
It's not part of this codebase; it's a build journal.

## Setup

Requires Python 3.12 (xgboost/shap wheel compatibility — see the decision log) and Node 22+.

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**macOS troubleshooting:** XGBoost needs the OpenMP runtime (`libomp.dylib`), which isn't
bundled in the PyPI wheel. Normally `brew install libomp` fixes this. If Homebrew can't
fetch a bottle for your macOS version (older macOS, no bottle built), see
`~/Desktop/PlantHealth-Decisions/04-xgboost-libomp-workaround.md` for a bottle-free fix.

### Run everything with one command

Once the venv above is created (and `pip install -r requirements.txt` has run):

```bash
./run.sh
```

Generates the synthetic dataset and trains the model if they don't exist yet (first run
only — several minutes), seeds demo tenants, and starts both the API
(`http://127.0.0.1:8000/docs`) and the frontend (`http://localhost:5173`) together. Ctrl+C
stops both. Demo logins: `basic@demo.planthealth` / `premium@demo.planthealth` /
`pro@demo.planthealth` / `both@demo.planthealth`, password `demo-password-123` for all.

The sections below run each piece individually — useful when iterating on one layer, or to
understand what `run.sh` is actually doing.

### Generate the demo dataset

```bash
python data/synthetic.py --plants-per-class 8 --duration-days 3 --fs-hz 10 --seed 42
```

### Sanity-check notebook

```bash
jupyter nbconvert --to notebook --execute --inplace notebooks/01_synthetic_data_sanity_check.ipynb
# or open it normally in Jupyter/VS Code to explore interactively
```

### Train the ML pipeline

```bash
cd backend && source .venv/bin/activate
python ml/train.py --data-dir data/generated
```

Prints the full honest report (leave-one-plant-out vs. inflated random-split, the
MiniRocket-like comparison, the confound ablation, calibration) and writes
`ml/models/` (deployable artifacts, gitignored) + `ml/reports/` (metrics + plots, tracked).
See `backend/ml/README.md`.

### Run the API

```bash
cd backend && source .venv/bin/activate
python -m api.seed          # demo tenants on every tier — prints logins, safe to re-run
uvicorn api.main:app --reload
```

Docs at `http://127.0.0.1:8000/docs`. Run the backend test suite with
`python -m pytest tests/ -v` (includes server-side tier-enforcement tests hitting the real
API). See `backend/api/README.md`.

### Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173` (needs the API running — see above). Demo logins:
`basic@demo.planthealth` / `premium@demo.planthealth` / `pro@demo.planthealth` /
`both@demo.planthealth`, password `demo-password-123` for all. See `frontend/README.md`.
