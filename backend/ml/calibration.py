"""
Calibration — PlantHealth.

Per section 3: "calibrate the probability outputs (Platt scaling or isotonic). A confidence
score that isn't calibrated is worse than no confidence score." An uncalibrated model that
says "90% confident" when it's actually right 60% of the time is actively misleading a
farmer standing in a field deciding whether to irrigate.

Fit calibration on the leave-one-plant-out *out-of-fold* predictions — never on in-sample
predictions, which would just calibrate the model to agree with itself. This still respects
the plant-grouping principle: the out-of-fold predictions already come from models that
never saw the plant they're predicting.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression


@dataclass
class Calibrator:
    """One-vs-rest calibration: a separate calibration curve per class, since XGBoost's
    softmax outputs for a 4-class problem don't calibrate well as a single scalar."""

    method: str  # "platt" | "isotonic"
    class_labels: list[str]
    _models: dict = None

    def fit(self, y_proba_raw: np.ndarray, y_true: np.ndarray) -> "Calibrator":
        self._models = {}
        for k, label in enumerate(self.class_labels):
            y_bin = (y_true == k).astype(int)
            scores = y_proba_raw[:, k]
            if self.method == "platt":
                lr = LogisticRegression()
                lr.fit(scores.reshape(-1, 1), y_bin)
                self._models[k] = lr
            else:
                iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
                iso.fit(scores, y_bin)
                self._models[k] = iso
        return self

    def transform(self, y_proba_raw: np.ndarray) -> np.ndarray:
        out = np.zeros_like(y_proba_raw)
        for k in range(y_proba_raw.shape[1]):
            model = self._models[k]
            scores = y_proba_raw[:, k]
            if self.method == "platt":
                out[:, k] = model.predict_proba(scores.reshape(-1, 1))[:, 1]
            else:
                out[:, k] = model.predict(scores)
        # renormalize so the row sums back to 1 — one-vs-rest calibration doesn't
        # guarantee that on its own
        row_sums = out.sum(axis=1, keepdims=True)
        row_sums[row_sums < 1e-9] = 1.0
        return out / row_sums


def reliability_table(y_proba: np.ndarray, y_true: np.ndarray, class_idx: int, n_bins: int = 10) -> dict:
    """For the Pro-tier calibration curve (section 9) and the lab metrics page: predicted
    probability vs. observed frequency, per bin, for one class."""
    y_bin = (y_true == class_idx).astype(int)
    frac_pos, mean_pred = calibration_curve(y_bin, y_proba[:, class_idx], n_bins=n_bins, strategy="quantile")
    return {"mean_predicted": mean_pred.tolist(), "observed_frequency": frac_pos.tolist()}
