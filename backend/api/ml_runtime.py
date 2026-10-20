"""
ML runtime — loads the trained artifacts from backend/ml/train.py once and serves
predictions. The only place in the API that touches the model directly; every router
goes through predict_window() / demo_window_for_plant() below.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR / "ml"))
sys.path.insert(0, str(BACKEND_DIR / "data"))

from features import _signal_features  # noqa: E402
from synthetic import CLASS_LABELS, HardwareConfig, PlantRecordingConfig, generate_plant_recording  # noqa: E402

from .config import settings


class ModelNotTrainedError(RuntimeError):
    pass


# Every demo window — /predict's "now" reading, /trend's day AND week views — is sliced
# from one canonical-length recording per plant (cached below), not regenerated per call at
# whatever duration that call happens to need. backend/data/synthetic.py's event generation
# (Poisson draws, movement artefacts) consumes its RNG stream in an order that depends on
# the TOTAL duration requested, so the same seed at duration_days=0.02 (a single window) vs
# 1.0 vs 7.0 diverges almost immediately — two calls for "the same plant, right now" would
# otherwise show different classes/confidences depending only on which endpoint asked.
# 7.5 days safely covers the 7-day trend view plus a window-length buffer regardless of the
# trained model's window_minutes.
DEMO_HISTORY_DAYS = 7.5


class MLRuntime:
    def __init__(self, models_dir: Path):
        self.models_dir = models_dir
        self._loaded = False
        self._recording_cache: dict[str, "pd.DataFrame"] = {}

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        required = ["xgboost_model.joblib", "calibrator.joblib", "label_encoder.joblib", "metadata.json"]
        missing = [f for f in required if not (self.models_dir / f).exists()]
        if missing:
            raise ModelNotTrainedError(
                f"Model artifacts missing from {self.models_dir}: {missing}. "
                f"Run: cd backend && python ml/train.py --data-dir data/generated"
            )
        self.model = joblib.load(self.models_dir / "xgboost_model.joblib")
        self.calibrator = joblib.load(self.models_dir / "calibrator.joblib")
        self.label_encoder = joblib.load(self.models_dir / "label_encoder.joblib")
        with open(self.models_dir / "metadata.json") as f:
            self.metadata = json.load(f)
        self.feature_columns: list[str] = self.metadata["feature_columns"]
        self.window_minutes: float = self.metadata["window_minutes"]
        self.model_version = hashlib.sha256(
            (self.models_dir / "xgboost_model.joblib").read_bytes()
        ).hexdigest()[:12]
        self._loaded = True

    def _window_to_feature_row(
        self, potential_mv: np.ndarray, air_temp_c: np.ndarray, humidity_pct: np.ndarray, leaf_temp_c: np.ndarray,
    ) -> pd.DataFrame:
        row = _signal_features(potential_mv)
        row["env_air_temp_mean_c"] = float(air_temp_c.mean())
        row["env_air_temp_std_c"] = float(air_temp_c.std())
        row["env_humidity_mean_pct"] = float(humidity_pct.mean())
        row["env_leaf_temp_mean_c"] = float(leaf_temp_c.mean())
        df = pd.DataFrame([row])
        return df[self.feature_columns]  # exact training column order

    def predict_window(
        self, potential_mv: list[float], air_temp_c: list[float], humidity_pct: list[float], leaf_temp_c: list[float],
    ) -> tuple[str, bool, dict[str, float]]:
        self._ensure_loaded()
        X = self._window_to_feature_row(
            np.asarray(potential_mv), np.asarray(air_temp_c), np.asarray(humidity_pct), np.asarray(leaf_temp_c),
        )
        raw_proba = self.model.predict_proba(X.to_numpy())
        calibrated = self.calibrator.transform(raw_proba)[0]
        class_idx = int(np.argmax(calibrated))
        class_label = self.label_encoder.classes_[class_idx]
        proba = {label: float(p) for label, p in zip(self.label_encoder.classes_, calibrated)}
        return class_label, class_label != "healthy", proba

    @staticmethod
    def demo_class_for_plant(plant_id: str) -> str:
        """Deterministic-per-plant class assignment (round-robin by plant_id hash) — the
        single source of truth so /predict and /trend agree on what class a given demo
        plant is, rather than each re-deriving it and risking drift."""
        seed = int(hashlib.sha256(plant_id.encode()).hexdigest(), 16) % (2**31)
        return CLASS_LABELS[seed % len(CLASS_LABELS)]

    def demo_recording_for_plant(self, plant_id: str, fs_hz: float = 10.0) -> "pd.DataFrame":
        """The one canonical-length (DEMO_HISTORY_DAYS) synthetic recording for this plant,
        generated once and cached — every demo window (predict's 'now', trend's day/week
        views) slices from this same array so they agree with each other. See
        DEMO_HISTORY_DAYS's docstring for why regenerating per-call at different durations
        would silently disagree."""
        self._ensure_loaded()
        cache_key = f"{plant_id}:{fs_hz}"
        if cache_key in self._recording_cache:
            return self._recording_cache[cache_key]
        seed = int(hashlib.sha256(plant_id.encode()).hexdigest(), 16) % (2**31)
        class_label = self.demo_class_for_plant(plant_id)
        cfg = PlantRecordingConfig(
            plant_id=plant_id, class_label=class_label,  # type: ignore[arg-type]
            duration_days=DEMO_HISTORY_DAYS, seed=seed, hardware=HardwareConfig(fs_hz=fs_hz),
        )
        df = generate_plant_recording(cfg)
        self._recording_cache[cache_key] = df
        return df

    def window_from_recording(self, df: "pd.DataFrame", end_offset_days: float, fs_hz: float) -> dict:
        """One window ending `end_offset_days` before the end of `df` (0 = the most recent
        window, i.e. 'now'). Used by both demo_window_for_plant (offset=0) and the trend
        endpoint (a range of offsets, so the trend reflects the SAME underlying physiology
        progression synthetic.py already models — e.g. drought's amplitude-shrink-over-days
        — rather than independently-drawn unrelated points."""
        window_n = int(self.window_minutes * 60 * fs_hz)
        end_n = len(df) - int(end_offset_days * 86400 * fs_hz)
        end_n = max(window_n, min(len(df), end_n))
        start_n = max(0, end_n - window_n)
        sliced = df.iloc[start_n:end_n]
        return {
            "potential_mv": sliced["potential_mv"].tolist(),
            "air_temp_c": sliced["air_temp_c"].tolist(),
            "humidity_pct": sliced["humidity_pct"].tolist(),
            "leaf_temp_c": sliced["leaf_temp_c"].tolist(),
        }

    def demo_window_for_plant(self, plant_id: str, fs_hz: float = 10.0) -> dict:
        """Deterministic-per-plant synthetic demo window — the most recent window ('now').
        Clearly for demo use only — see backend/data/README.md. Used when a caller doesn't
        supply raw signal arrays."""
        df = self.demo_recording_for_plant(plant_id, fs_hz)
        window = self.window_from_recording(df, end_offset_days=0.0, fs_hz=fs_hz)
        window["true_class_label"] = self.demo_class_for_plant(plant_id)  # demo-only, not tier-returned
        return window


runtime = MLRuntime(settings.ml_models_dir)
