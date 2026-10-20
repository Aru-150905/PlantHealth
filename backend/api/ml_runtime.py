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


class MLRuntime:
    def __init__(self, models_dir: Path):
        self.models_dir = models_dir
        self._loaded = False

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

    def demo_window_for_plant(self, plant_id: str, fs_hz: float = 10.0) -> dict:
        """Deterministic-per-plant synthetic demo window (round-robin class by plant_id
        hash), clearly for demo use only — see backend/data/README.md. Used when a caller
        doesn't supply raw signal arrays."""
        self._ensure_loaded()
        seed = int(hashlib.sha256(plant_id.encode()).hexdigest(), 16) % (2**31)
        class_label = CLASS_LABELS[seed % len(CLASS_LABELS)]
        cfg = PlantRecordingConfig(
            plant_id=plant_id, class_label=class_label,  # type: ignore[arg-type]
            duration_days=max(self.window_minutes / (60 * 24), 0.05), seed=seed,
            hardware=HardwareConfig(fs_hz=fs_hz),
        )
        df = generate_plant_recording(cfg)
        window_n = int(self.window_minutes * 60 * fs_hz)
        df = df.iloc[-window_n:] if len(df) >= window_n else df
        return {
            "potential_mv": df["potential_mv"].tolist(),
            "air_temp_c": df["air_temp_c"].tolist(),
            "humidity_pct": df["humidity_pct"].tolist(),
            "leaf_temp_c": df["leaf_temp_c"].tolist(),
            "true_class_label": class_label,  # demo-only convenience, not returned to tier-gated callers
        }


runtime = MLRuntime(settings.ml_models_dir)
