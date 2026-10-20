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
- [ ] 5. Farmer view
- [ ] 6. Lab view + confound panel
- [ ] 7. Admin dashboard
- [ ] 8. Tier gating end to end + demo-data banner

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

(A single top-level one-command run for both services lands with step 5.)
