"""
Explainability — PlantHealth. Per section 3: "SHAP values, so the app can say which signal
features drove a prediction." Used by the lab view's SHAP panel (Pro tier, section 9) and
the farmer view's plain-language "why" (via explain_prediction_plain()).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import shap


def compute_shap_values(model, X: pd.DataFrame) -> shap.Explanation:
    """TreeExplainer is exact and fast for XGBoost — no sampling/approximation needed."""
    explainer = shap.TreeExplainer(model)
    return explainer(X)


def top_features_for_prediction(shap_values: shap.Explanation, row_idx: int, class_idx: int, k: int = 5) -> list[dict]:
    """The k features that pushed this specific prediction most, for one window.
    Positive shap_value = pushed toward this class; negative = pushed away."""
    values = shap_values.values[row_idx, :, class_idx] if shap_values.values.ndim == 3 else shap_values.values[row_idx]
    order = np.argsort(-np.abs(values))[:k]
    return [
        {"feature": shap_values.feature_names[i], "shap_value": float(values[i]), "feature_value": float(shap_values.data[row_idx, i])}
        for i in order
    ]


def explain_prediction_plain(top_features: list[dict]) -> str:
    """Lab wording uses the raw feature names; farmer wording (section 5's vocabulary fork)
    translates the top driver into plain language. Small fixed mapping — extend as features
    grow."""
    PLAIN = {
        "variance": "how much the signal is swinging",
        "hjorth_mobility": "how fast the signal is changing",
        "hjorth_complexity": "how irregular the signal's changes are",
        "crest_factor": "how spiky the signal is",
        "zero_crossing_rate": "how often the signal flips direction",
        "env_air_temp_mean_c": "the air temperature",
        "env_humidity_mean_pct": "the humidity",
        "env_leaf_temp_mean_c": "the leaf temperature",
    }
    if not top_features:
        return "not enough signal to explain yet"
    lead = top_features[0]["feature"]
    for prefix, phrase in PLAIN.items():
        if lead.startswith(prefix):
            return phrase
    if lead.startswith("wavelet_energy"):
        return "the shape of fast activity in the signal"
    return lead.replace("_", " ")
