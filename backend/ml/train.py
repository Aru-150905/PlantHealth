"""
Training pipeline orchestrator — PlantHealth.

Runs the full step-2 pipeline end to end and prints the honest report:
  1. Build engineered-feature tables at 5-min and 30-min windows.
  2. For each window size: XGBoost, leave-one-plant-out CV (honest) AND a random-split
     CV (dishonest, labelled, shown only to demonstrate the leakage).
  3. Pick the better window size by the HONEST (leave-one-plant-out) score.
  4. MiniRocket-like comparison on raw 30-min windows, same honest/dishonest pair.
  5. Calibrate the winning XGBoost model's probabilities on its leave-one-plant-out
     out-of-fold predictions; report Brier score before/after.
  6. Fit a final XGBoost model on all data for deployment; compute SHAP values.
  7. Save every artifact backend/ml/models/ (gitignored, regenerate on demand) and
     backend/ml/reports/ (tracked — this is the "honest metrics" proof of step 2).

Run:
    cd backend && source .venv/bin/activate
    python ml/train.py --data-dir data/generated
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from sklearn.preprocessing import LabelEncoder

sys.path.insert(0, str(Path(__file__).parent))
from calibration import Calibrator, reliability_table
from explain import compute_shap_values
from features import WindowConfig, build_feature_table, extract_raw_windows, feature_columns
from models import MiniRocketLikeClassifier, build_xgboost
from validation import CVResult, inflated_random_split_cv, leave_one_plant_out_cv

WINDOW_SIZES_MIN = [5.0, 30.0]
RAW_MODEL_WINDOW_MIN = 30.0  # MiniRocket-like only on the longer window — see backend/ml/README.md


def _print_header(title: str) -> None:
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def _print_cv_result(r: CVResult) -> None:
    print(f"  method       : {r.method}")
    print(f"  folds        : {r.n_folds}")
    print(f"  accuracy     : {r.accuracy:.4f}")
    print(f"  macro F1     : {r.macro_f1:.4f}")
    print(f"  log loss     : {r.log_loss:.4f}")
    print(f"  brier score  : {r.brier_score():.4f}")
    print(f"  classes      : {r.class_labels}")
    print("  confusion matrix (rows=true, cols=pred):")
    cm = pd.DataFrame(r.confusion, index=r.class_labels, columns=r.class_labels)
    print(cm.to_string().replace("\n", "\n    "))
    if r.warning:
        print(f"  *** {r.warning}")


def run(data_dir: Path, out_models: Path, out_reports: Path, fs_hz: float, seed: int) -> None:
    out_models.mkdir(parents=True, exist_ok=True)
    out_reports.mkdir(parents=True, exist_ok=True)

    raw_dir = data_dir / "raw"
    manifest = pd.read_csv(data_dir / "manifest.csv")
    print(f"Loaded manifest: {len(manifest)} plants, classes: {manifest['class_label'].value_counts().to_dict()}")

    report: dict = {"is_synthetic": True, "generated_from": str(data_dir), "window_results": {}}

    # ---------------------------------------------------------------- feature-based models
    feature_tables: dict[float, pd.DataFrame] = {}
    for wmin in WINDOW_SIZES_MIN:
        _print_header(f"Window = {wmin} min — engineered features + XGBoost")
        cfg = WindowConfig(window_minutes=wmin, overlap_frac=0.5)
        fdf = build_feature_table(raw_dir, manifest, fs_hz, cfg)
        feature_tables[wmin] = fdf
        feat_cols = feature_columns(fdf)
        X = fdf[feat_cols]
        n_classes = fdf["class_label"].nunique()

        print(f"  {len(fdf)} windows, {len(feat_cols)} features, {n_classes} classes")

        honest = leave_one_plant_out_cv(
            X, fdf["class_label"], fdf["plant_id"],
            model_factory=lambda: build_xgboost(n_classes, seed=seed),
        )
        print("\n-- HONEST: leave-one-plant-out --")
        _print_cv_result(honest)

        dishonest = inflated_random_split_cv(
            X, fdf["class_label"], fdf["plant_id"],
            model_factory=lambda: build_xgboost(n_classes, seed=seed), seed=seed,
        )
        print("\n-- INFLATED (DO NOT USE): random split over windows --")
        _print_cv_result(dishonest)

        print(f"\n  ==> random split overstates accuracy by "
              f"{(dishonest.accuracy - honest.accuracy) * 100:+.1f} points "
              f"({honest.accuracy:.3f} honest vs {dishonest.accuracy:.3f} inflated)")

        report["window_results"][f"{wmin}min_xgboost"] = {
            "n_windows": len(fdf), "n_features": len(feat_cols),
            "honest_leave_one_plant_out": honest.summary(),
            "inflated_random_split_DO_NOT_USE": dishonest.summary(),
            "inflation_accuracy_points": round((dishonest.accuracy - honest.accuracy) * 100, 2),
        }

    best_wmin = max(
        WINDOW_SIZES_MIN,
        key=lambda w: report["window_results"][f"{w}min_xgboost"]["honest_leave_one_plant_out"]["macro_f1"],
    )
    print(f"\nBest window size by HONEST macro F1: {best_wmin} min")
    report["chosen_window_minutes"] = best_wmin

    # ---------------------------------------------------------------- raw-window comparison
    _print_header(f"Window = {RAW_MODEL_WINDOW_MIN} min — raw windows + MiniRocket-like (simplified)")
    raw_cfg = WindowConfig(window_minutes=RAW_MODEL_WINDOW_MIN, overlap_frac=0.5)
    raw_arrs, raw_metas = [], []
    for plant_id in manifest["plant_id"]:
        plant_df = pd.read_parquet(raw_dir / f"{plant_id}.parquet")
        arr, meta = extract_raw_windows(plant_df, fs_hz, raw_cfg)
        raw_arrs.append(arr)
        raw_metas.append(meta)
    raw_X = np.concatenate(raw_arrs, axis=0)
    raw_meta = pd.concat(raw_metas, ignore_index=True)
    print(f"  {raw_X.shape[0]} raw windows of length {raw_X.shape[1]} samples")

    raw_X_df = pd.DataFrame({"_raw": list(raw_X)})  # wrapped so it fits the X: DataFrame interface

    class _RawWrapper:
        """Adapts validation.py's DataFrame-shaped interface (X.to_numpy()) to the raw
        (n, window_len) array MiniRocketLikeClassifier expects."""
        def __init__(self, arr):
            self._arr = arr
        def to_numpy(self):
            return self._arr

    honest_raw = leave_one_plant_out_cv(
        _RawWrapper(raw_X), raw_meta["class_label"], raw_meta["plant_id"],
        model_factory=lambda: MiniRocketLikeClassifier(seed=seed),
    )
    print("\n-- HONEST: leave-one-plant-out (MiniRocket-like) --")
    _print_cv_result(honest_raw)

    dishonest_raw = inflated_random_split_cv(
        _RawWrapper(raw_X), raw_meta["class_label"], raw_meta["plant_id"],
        model_factory=lambda: MiniRocketLikeClassifier(seed=seed), seed=seed,
    )
    print("\n-- INFLATED (DO NOT USE): random split (MiniRocket-like) --")
    _print_cv_result(dishonest_raw)

    report["minirocket_like_raw_30min"] = {
        "n_windows": len(raw_meta),
        "honest_leave_one_plant_out": honest_raw.summary(),
        "inflated_random_split_DO_NOT_USE": dishonest_raw.summary(),
    }

    xgb_honest_f1 = report["window_results"][f"{best_wmin}min_xgboost"]["honest_leave_one_plant_out"]["macro_f1"]
    rocket_honest_f1 = honest_raw.summary()["macro_f1"]
    report["model_comparison_honest_macro_f1"] = {
        f"xgboost_{best_wmin}min_features": xgb_honest_f1,
        "minirocket_like_30min_raw": rocket_honest_f1,
    }
    print(f"\nHonest comparison — XGBoost ({best_wmin}min features): {xgb_honest_f1:.4f} macro F1  "
          f"vs  MiniRocket-like (30min raw): {rocket_honest_f1:.4f} macro F1")

    # ---------------------------------------------------------------- confound ablation
    # SHAP (below) tends to show environmental features — especially env_air_temp_std_c —
    # dominating the heat class. That's suspicious: it's exactly where
    # backend/data/synthetic.py's compressor confound lives (see that module's docstring
    # and section 7 of the brief). Quantify how much honest accuracy actually depends on
    # environmental channels vs. the electrical signal alone, BEFORE claiming a number.
    _print_header(f"Confound check — {best_wmin}min XGBoost, electrical signal only vs. +environment")
    best_fdf_for_ablation = feature_tables[best_wmin]
    all_feat_cols = feature_columns(best_fdf_for_ablation)
    env_cols = [c for c in all_feat_cols if c.startswith("env_")]
    signal_cols = [c for c in all_feat_cols if not c.startswith("env_")]
    n_classes_ablation = best_fdf_for_ablation["class_label"].nunique()

    signal_only = leave_one_plant_out_cv(
        best_fdf_for_ablation[signal_cols], best_fdf_for_ablation["class_label"], best_fdf_for_ablation["plant_id"],
        model_factory=lambda: build_xgboost(n_classes_ablation, seed=seed),
    )
    with_env = leave_one_plant_out_cv(
        best_fdf_for_ablation[all_feat_cols], best_fdf_for_ablation["class_label"], best_fdf_for_ablation["plant_id"],
        model_factory=lambda: build_xgboost(n_classes_ablation, seed=seed),
    )
    print(f"  signal features only ({len(signal_cols)} features): "
          f"accuracy={signal_only.accuracy:.4f}, macro F1={signal_only.macro_f1:.4f}")
    print(f"  signal + environment ({len(all_feat_cols)} features): "
          f"accuracy={with_env.accuracy:.4f}, macro F1={with_env.macro_f1:.4f}")
    env_gain_points = (with_env.accuracy - signal_only.accuracy) * 100
    print(f"  environment features change honest accuracy by {env_gain_points:+.1f} points")
    if env_gain_points > 2:
        print("  *** Environmental channels are meaningfully improving the honest score. Given")
        print("  *** this dataset's deliberately-injected incubator compressor confound (see")
        print("  *** backend/data/synthetic.py), some of that gain is plausibly the chamber's")
        print("  *** compressor artefact, not the plant. This is precisely what the lab view's")
        print("  *** confound panel (brief section 7) exists to let a user catch. The shipped")
        print("  *** model intentionally keeps environment features (lab users need to see this")
        print("  *** exact failure mode, not have it hidden) — see backend/ml/README.md.")
    report["confound_ablation"] = {
        "signal_only": signal_only.summary(),
        "signal_plus_environment": with_env.summary(),
        "accuracy_points_from_environment": round(env_gain_points, 2),
    }

    # ---------------------------------------------------------------- calibration
    _print_header(f"Calibration — on {best_wmin}min XGBoost leave-one-plant-out out-of-fold predictions")
    best_fdf = feature_tables[best_wmin]
    feat_cols = feature_columns(best_fdf)
    X_best = best_fdf[feat_cols]
    n_classes = best_fdf["class_label"].nunique()

    honest_best = leave_one_plant_out_cv(
        X_best, best_fdf["class_label"], best_fdf["plant_id"],
        model_factory=lambda: build_xgboost(n_classes, seed=seed),
    )
    cal = Calibrator(method="isotonic", class_labels=honest_best.class_labels)
    cal.fit(honest_best.y_pred_proba, honest_best.y_true)
    calibrated_proba = cal.transform(honest_best.y_pred_proba)

    from sklearn.metrics import log_loss as sk_log_loss
    brier_before = honest_best.brier_score()
    one_hot = np.eye(len(honest_best.class_labels))[honest_best.y_true]
    brier_after = float(np.mean(np.sum((calibrated_proba - one_hot) ** 2, axis=1)))
    print(f"  Brier score before calibration: {brier_before:.4f}")
    print(f"  Brier score after  calibration: {brier_after:.4f}")
    report["calibration"] = {
        "method": "isotonic", "brier_before": round(brier_before, 4), "brier_after": round(brier_after, 4),
    }

    # reliability plot for the Pro-tier calibration curve (section 9)
    fig, axes = plt.subplots(1, len(honest_best.class_labels), figsize=(4 * len(honest_best.class_labels), 4), sharey=True)
    for i, label in enumerate(honest_best.class_labels):
        rt_before = reliability_table(honest_best.y_pred_proba, honest_best.y_true, i)
        rt_after = reliability_table(calibrated_proba, honest_best.y_true, i)
        ax = axes[i]
        ax.plot([0, 1], [0, 1], "k--", lw=1, label="perfect")
        ax.plot(rt_before["mean_predicted"], rt_before["observed_frequency"], "o-", label="before", color="tab:red")
        ax.plot(rt_after["mean_predicted"], rt_after["observed_frequency"], "o-", label="after (isotonic)", color="tab:green")
        ax.set_title(label)
        ax.set_xlabel("predicted probability")
    axes[0].set_ylabel("observed frequency")
    axes[0].legend(fontsize=8)
    fig.suptitle("SYNTHETIC DATA — calibration reliability, leave-one-plant-out out-of-fold")
    plt.tight_layout()
    plt.savefig(out_reports / "calibration_curve.png", dpi=110)
    plt.close(fig)

    # ---------------------------------------------------------------- final deployed model + SHAP
    _print_header(f"Final model: XGBoost on {best_wmin}min features, trained on ALL plants, + SHAP")
    le = LabelEncoder().fit(best_fdf["class_label"])
    final_model = build_xgboost(n_classes, seed=seed)
    final_model.fit(X_best.to_numpy(), le.transform(best_fdf["class_label"]))

    sample_n = min(2000, len(X_best))
    sample_idx = np.random.default_rng(seed).choice(len(X_best), size=sample_n, replace=False)
    shap_values = compute_shap_values(final_model, X_best.iloc[sample_idx])

    fig = plt.figure(figsize=(9, 7))
    try:
        shap.summary_plot(shap_values, X_best.iloc[sample_idx], class_names=list(le.classes_), show=False, max_display=15)
        plt.title(f"SYNTHETIC DATA — SHAP summary, {best_wmin}min XGBoost ({sample_n} sampled windows)")
        plt.tight_layout()
        plt.savefig(out_reports / "shap_summary.png", dpi=110)
    finally:
        plt.close(fig)

    # final calibrator refit on the full out-of-fold set (already done above as `cal`)
    joblib.dump(final_model, out_models / "xgboost_model.joblib")
    joblib.dump(cal, out_models / "calibrator.joblib")
    joblib.dump(le, out_models / "label_encoder.joblib")
    with open(out_models / "metadata.json", "w") as f:
        json.dump({
            "is_synthetic": True,
            "window_minutes": best_wmin,
            "fs_hz": fs_hz,
            "feature_columns": feat_cols,
            "class_labels": list(le.classes_),
            "trained_on_n_plants": int(manifest["plant_id"].nunique()),
            "trained_on_n_windows": len(X_best),
            "honest_leave_one_plant_out_accuracy": honest_best.accuracy,
            "honest_leave_one_plant_out_macro_f1": honest_best.macro_f1,
            "confound_ablation_accuracy_points_from_environment": round(env_gain_points, 2),
            "note": "Trained entirely on synthetic data. honest_* metrics measure whether "
                    "the pipeline works, not real-world performance. See backend/ml/README.md. "
                    "confound_ablation_* quantifies how much of the honest accuracy comes from "
                    "environmental channels (which carry a deliberately-injected incubator "
                    "compressor artefact on the heat class) vs. the electrical signal alone — "
                    "see the 'Confound finding' section of backend/ml/README.md.",
        }, f, indent=2)

    report["final_model"] = {
        "window_minutes": best_wmin,
        "n_features": len(feat_cols),
        "trained_on_n_windows": len(X_best),
    }
    with open(out_reports / "metrics.json", "w") as f:
        json.dump(report, f, indent=2)

    _print_header("DONE")
    print(f"Models  -> {out_models}")
    print(f"Reports -> {out_reports}")
    print("ALL METRICS ABOVE ARE FROM SYNTHETIC DATA — they measure whether the pipeline")
    print("works, not real-world performance. See backend/ml/README.md section 'What these")
    print("numbers do and do not mean'.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).parent.parent / "data" / "generated")
    parser.add_argument("--out-models", type=Path, default=Path(__file__).parent / "models")
    parser.add_argument("--out-reports", type=Path, default=Path(__file__).parent / "reports")
    parser.add_argument("--fs-hz", type=float, default=10.0)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    run(args.data_dir, args.out_models, args.out_reports, args.fs_hz, args.seed)


if __name__ == "__main__":
    main()
