# API

FastAPI backend: auth, multi-tenant accounts, server-side tier enforcement, predictions
(backed by the step-2 ML pipeline), and a live-streaming WebSocket. The role fork's actual
onboarding flows (section 5) land in step 4 — this step lays the auth/tenant/tier/role-field
foundation they build on.

## Run it

```bash
cd backend && source .venv/bin/activate
python -m api.seed          # creates demo tenants on each tier (see below) — safe to re-run
uvicorn api.main:app --reload
```

Docs at `http://127.0.0.1:8000/docs`. The seed script prints 5 demo logins (one per tier,
one dual-role, one platform admin), all with password `demo-password-123`.

## Structure

- `models.py` — SQLAlchemy ORM: `Tenant` (name, tier, role, suspended), `User` (belongs to a
  tenant; `is_admin` for the section-10 dashboard), `Device` (a sentinel unit), `Plant` (a
  sentinel-centered unit — `covered_count` is the neighbour-block size for farmers, normally
  1 for a lab's individually-tracked plant), `Prediction` (one model call's full result,
  stored un-gated; what callers receive is the *tier-shaped view* of this row).
- `tiers.py` — **the single source of truth for section 9's table.** `TIER_LIMITS` encodes
  every row; `check_device_limit` / `check_plants_covered_limit` enforce the counts server-
  side (403 + an upgrade-pitch message, not a silent UI-only block); `shape_prediction`
  gates every field a prediction response can carry (which-of-4-states, confidence detail,
  SHAP availability, diagnosis/remedy, raw export) by tier. No router re-implements this
  logic locally — they all call into this module.
- `ml_runtime.py` — loads `backend/ml/models/` once, turns a raw window (or, if none is
  supplied, a deterministic-per-plant synthetic demo window) into a calibrated prediction.
  `model_version` is a hash of the model file, so the admin model registry (step 7) can tell
  which tenants are on which version without a separate version-bump ritual.
- `sentinel.py` — the confidence-decay model behind the farmer field map (section 4):
  concentric rings around the sentinel, confidence strictly decreasing per ring, a floor
  below which a cell becomes "unknown" rather than a false guess. See
  `~/Desktop/PlantHealth-Decisions/09-farmer-view-and-sentinel.md`.
- `routers/` — `auth` (register/login/me), `tenants` (tier-limits readout, role/onboarding
  setting), `devices`/`plants` (tier-enforced CRUD), `predict` (the gated prediction
  endpoint), `field` (the sentinel field map + 24h/7d trend), `ws` (live streaming).
- `seed.py` — per section 11: demo tenants on every tier with plausible devices/plants.

## Tier enforcement, concretely

Every limit in section 9's table has at least one test in `backend/tests/test_tier_enforcement.py`
that hits it over the actual HTTP API — not a unit test of `tiers.py` in isolation. Run:

```bash
cd backend && source .venv/bin/activate && python -m pytest tests/ -v
```

## What's NOT built yet (later steps)

- The role-fork onboarding wizards (farmer/lab) that actually populate Tenant.role and the
  farmer/lab-specific profile fields (step 4).
- Real device ingestion — `/ws/stream` and `/plants/{id}/predict` without a body both serve
  a **synthetic** demo signal (always `is_synthetic=true`); there is no real hardware
  connection in this project, so there's nothing to wire a "real" path to yet.
- Admin router endpoints (`require_admin` dependency exists and is tested implicitly via
  `User.is_admin`, but section 10's actual dashboard endpoints land in step 7).
- Alerting (email/webhook — section 9's `alerts` tier field is tracked in `TIER_LIMITS` but
  nothing sends one yet).

## Auth notes

JWT bearer tokens, `bcrypt` for password hashing (not `passlib` — see
`~/Desktop/PlantHealth-Decisions/07-fastapi-backend.md` for why). `PLANTHEALTH_SECRET_KEY`
has an insecure dev default so the app runs with zero config per the brief's "everything
runs locally with one command" — override it before any real deployment. No migration tool;
local schema changes mean deleting `plant_health.db` and re-seeding.
