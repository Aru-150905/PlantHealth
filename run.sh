#!/usr/bin/env bash
# One-command local run — brief section 11: "Everything runs locally with one command."
# Seeds the backend if needed, trains the model if it hasn't been trained yet, then starts
# the API and the frontend dev server together. Ctrl+C stops both.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d backend/.venv ]; then
  echo "No backend/.venv found — see README.md 'Setup' to create it and install requirements first."
  exit 1
fi
if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend dependencies (npm install)…"
  (cd frontend && npm install)
fi

source backend/.venv/bin/activate

if [ ! -f backend/ml/models/xgboost_model.joblib ]; then
  echo "No trained model found — training now (backend/ml/train.py). This can take several minutes."
  if [ ! -d backend/data/generated/raw ]; then
    echo "No synthetic dataset found — generating it first (backend/data/synthetic.py)."
    (cd backend && python data/synthetic.py --plants-per-class 8 --duration-days 3 --fs-hz 10 --seed 42)
  fi
  (cd backend && python ml/train.py --data-dir data/generated)
fi

echo "Seeding demo tenants (safe to re-run)…"
(cd backend && python -m api.seed)

cleanup() {
  echo
  echo "Stopping…"
  kill "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd backend && uvicorn api.main:app --reload) &
API_PID=$!

(cd frontend && npm run dev) &
WEB_PID=$!

echo
echo "API:      http://127.0.0.1:8000/docs"
echo "Frontend: http://localhost:5173"
echo "Demo logins: basic@demo.planthealth / premium@demo.planthealth / pro@demo.planthealth / both@demo.planthealth — password demo-password-123"
echo "Press Ctrl+C to stop both."
echo

wait
