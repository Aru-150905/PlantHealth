"""
Validation — PlantHealth.

This is the most important module in the ML pipeline, per the brief: "Never split windows
randomly: windows from the same plant are highly correlated, so a random split leaks the
answer into the test set and inflates accuracy enormously."

Why windows from the same plant leak: backend/data/synthetic.py draws one set of per-plant
random effects (baseline offset, diurnal amplitude, severity, noise level...) and reuses them
across that plant's *entire* recording. A model can learn "this specific baseline / amplitude
/ noise signature belongs to plant X, who is drought" rather than learning the general
drought signature — and a random window split puts windows from the same plant on both sides
of the train/test boundary, so that kind of memorization looks like generalization. In a real
deployment the model has never seen the new plant at all. Leave-one-plant-out CV is the only
split that actually tests that.

Two entry points:
  - leave_one_plant_out_cv(...) — the honest number. Report this one.
  - inflated_random_split_cv(...) — included ONLY to demonstrate, side by side, how badly a
    random split over-states accuracy. Never used to select a model or report "the" accuracy.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score, brier_score_loss, confusion_matrix, f1_score, log_loss,
)
from sklearn.model_selection import LeaveOneGroupOut, train_test_split
from sklearn.preprocessing import LabelEncoder


@dataclass
class CVResult:
    method: str  # "leave_one_plant_out" | "random_split_DO_NOT_USE"
    accuracy: float
    macro_f1: float
    log_loss: float
    confusion: np.ndarray
    class_labels: list[str]
    y_true: np.ndarray
    y_pred_proba: np.ndarray  # out-of-fold / held-out predicted probabilities
    groups_held_out: np.ndarray  # plant_id (or NaN for random split) per prediction
    n_folds: int
    warning: str = ""

    def brier_score(self) -> float:
        """Multiclass Brier score: mean squared error between predicted probability
        vectors and one-hot true labels. Lower is better; 0 is perfect."""
        n_classes = self.y_pred_proba.shape[1]
        one_hot = np.eye(n_classes)[self.y_true]
        return float(np.mean(np.sum((self.y_pred_proba - one_hot) ** 2, axis=1)))

    def summary(self) -> dict:
        return {
            "method": self.method,
            "n_folds": self.n_folds,
            "accuracy": round(self.accuracy, 4),
            "macro_f1": round(self.macro_f1, 4),
            "log_loss": round(self.log_loss, 4),
            "brier_score": round(self.brier_score(), 4),
            "warning": self.warning,
        }


def leave_one_plant_out_cv(
    X: pd.DataFrame,
    y_label: pd.Series,
    plant_ids: pd.Series,
    model_factory: Callable[[], object],
) -> CVResult:
    """The honest validation. One fold per plant: train on every other plant, test on the
    held-out plant's windows. The model never sees the held-out plant's individual
    signature during training — this is what "generalizes to a new plant" actually means.
    """
    le = LabelEncoder()
    y = le.fit_transform(y_label)
    groups = plant_ids.to_numpy()
    X_arr = X.to_numpy()

    logo = LeaveOneGroupOut()
    all_true, all_proba, all_groups = [], [], []
    n_folds = 0

    for train_idx, test_idx in logo.split(X_arr, y, groups):
        model = model_factory()
        model.fit(X_arr[train_idx], y[train_idx])
        proba = model.predict_proba(X_arr[test_idx])
        all_true.append(y[test_idx])
        all_proba.append(proba)
        all_groups.append(groups[test_idx])
        n_folds += 1

    y_true = np.concatenate(all_true)
    y_proba = np.concatenate(all_proba)
    groups_out = np.concatenate(all_groups)
    y_pred = np.argmax(y_proba, axis=1)

    return CVResult(
        method="leave_one_plant_out",
        accuracy=accuracy_score(y_true, y_pred),
        macro_f1=f1_score(y_true, y_pred, average="macro"),
        log_loss=log_loss(y_true, y_proba, labels=list(range(len(le.classes_)))),
        confusion=confusion_matrix(y_true, y_pred),
        class_labels=list(le.classes_),
        y_true=y_true,
        y_pred_proba=y_proba,
        groups_held_out=groups_out,
        n_folds=n_folds,
    )


def inflated_random_split_cv(
    X: pd.DataFrame,
    y_label: pd.Series,
    plant_ids: pd.Series,
    model_factory: Callable[[], object],
    test_size: float = 0.2,
    seed: int = 0,
) -> CVResult:
    """DO NOT USE THIS NUMBER FOR ANYTHING. This exists only to be printed next to the
    honest leave-one-plant-out score, as a labelled example of the mistake the brief warns
    against: a plain random split over windows, ignoring that windows from the same plant
    are correlated. Included purely for the honesty requirement in section 3 / section 8.
    """
    le = LabelEncoder()
    y = le.fit_transform(y_label)
    X_arr = X.to_numpy()

    X_train, X_test, y_train, y_test = train_test_split(
        X_arr, y, test_size=test_size, random_state=seed, stratify=y
    )

    model = model_factory()
    model.fit(X_train, y_train)
    proba = model.predict_proba(X_test)
    y_pred = np.argmax(proba, axis=1)

    return CVResult(
        method="random_split_DO_NOT_USE",
        accuracy=accuracy_score(y_test, y_pred),
        macro_f1=f1_score(y_test, y_pred, average="macro"),
        log_loss=log_loss(y_test, proba, labels=list(range(len(le.classes_)))),
        confusion=confusion_matrix(y_test, y_pred),
        class_labels=list(le.classes_),
        y_true=y_test,
        y_pred_proba=proba,
        groups_held_out=np.full(len(y_test), np.nan),
        n_folds=1,
        warning=(
            "THIS NUMBER IS DISHONEST. Windows from the same plant appear on both sides of "
            "this split, so the model partly memorized per-plant signatures rather than "
            "learning the class. It does not estimate real-world performance on a new "
            "plant. Shown only to demonstrate the leakage the brief warns about — see "
            "leave_one_plant_out_cv() for the number that should actually be reported."
        ),
    )
