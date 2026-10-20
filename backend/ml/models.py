"""
Model builders — PlantHealth.

Per section 3 of the brief: "XGBoost as the baseline. Also try a 1D-CNN or MiniRocket on
raw windows. Compare them honestly."

- build_xgboost(): the baseline, trained on backend/ml/features.py's engineered features.
- MiniRocketLikeClassifier: the "also try" comparison, operating on raw windows instead of
  engineered features. This is a SIMPLIFIED, self-written reimplementation inspired by the
  MiniRocket idea (random convolutional kernels + proportion-of-positive-values pooling +
  a linear classifier on top) — not the canonical MiniRocket algorithm from Dempster et al.
  and not backed by the `sktime`/`aeon` reference implementation. Documented honestly as
  such; see backend/ml/README.md for exactly what's simplified and why.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.linear_model import RidgeClassifier
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier


def build_xgboost(num_class: int, seed: int = 0) -> XGBClassifier:
    return XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        objective="multi:softprob",
        num_class=num_class,
        eval_metric="mlogloss",
        random_state=seed,
        n_jobs=-1,
    )


# --------------------------------------------------------------------------------------
# Simplified MiniRocket-like transform
# --------------------------------------------------------------------------------------


def _decimate(windows: np.ndarray, target_len: int) -> np.ndarray:
    """Linearly-spaced subsampling to a fixed length (NOT anti-alias-filtered decimation
    — a documented simplification, see backend/ml/README.md)."""
    n, length = windows.shape
    idx = np.linspace(0, length - 1, target_len).astype(int)
    return windows[:, idx]


@dataclass
class _KernelGroup:
    dilation: int
    weights: np.ndarray  # (kernel_len, n_kernels_in_group)


def _make_kernel_groups(
    decimated_len: int, kernel_len: int, n_kernels: int, dilations: tuple[int, ...], rng: np.random.Generator,
) -> list[_KernelGroup]:
    valid_dilations = [d for d in dilations if (kernel_len - 1) * d < decimated_len]
    groups = []
    per_group = max(1, n_kernels // len(valid_dilations))
    for d in valid_dilations:
        # weights in {-1, 1}, mean-centered per kernel (standard MiniRocket-style trick:
        # mean-centering a convolution kernel makes PPV invariant to a window's DC offset)
        w = rng.choice([-1.0, 1.0], size=(kernel_len, per_group))
        w = w - w.mean(axis=0, keepdims=True)
        groups.append(_KernelGroup(dilation=d, weights=w))
    return groups


def _ppv_features_for_group(windows: np.ndarray, group: _KernelGroup, batch_size: int = 2000) -> np.ndarray:
    """Proportion-of-positive-values pooling for one dilation group, batched over windows
    to bound memory (see backend/ml/README.md for the complexity trade-off)."""
    n, length = windows.shape
    kernel_len, n_kernels = group.weights.shape
    d = group.dilation
    out_len = length - (kernel_len - 1) * d
    ppv = np.empty((n, n_kernels), dtype=np.float32)

    for start in range(0, n, batch_size):
        end = min(n, start + batch_size)
        batch = windows[start:end]  # (b, length)
        b = end - start
        # im2col via as_strided: patches[b, t, k] = batch[b, t + k*d]
        patches = np.lib.stride_tricks.as_strided(
            batch,
            shape=(b, out_len, kernel_len),
            strides=(batch.strides[0], batch.strides[1], batch.strides[1] * d),
            writeable=False,
        )
        conv = np.tensordot(patches, group.weights, axes=([2], [0]))  # (b, out_len, n_kernels)
        ppv[start:end] = (conv > 0).mean(axis=1)
    return ppv


class MiniRocketLikeClassifier(BaseEstimator, ClassifierMixin):
    """Simplified MiniRocket-style transform (random dilated kernels -> PPV pooling) feeding
    a RidgeClassifier, matching the MiniRocket paper's own recommendation to pair the
    transform with a linear classifier rather than something heavier. Operates on raw
    windows (n_samples, window_len), not the engineered feature table.
    """

    def __init__(
        self,
        decimated_len: int = 400,
        kernel_len: int = 9,
        n_kernels: int = 300,
        dilations: tuple[int, ...] = (1, 2, 4, 8, 16, 32),
        seed: int = 0,
    ):
        self.decimated_len = decimated_len
        self.kernel_len = kernel_len
        self.n_kernels = n_kernels
        self.dilations = dilations
        self.seed = seed

    def _transform(self, raw_windows: np.ndarray) -> np.ndarray:
        dec = _decimate(raw_windows, self.decimated_len).astype(np.float32)
        feats = [_ppv_features_for_group(dec, g) for g in self._groups]
        return np.concatenate(feats, axis=1)

    def fit(self, raw_windows: np.ndarray, y: np.ndarray):
        rng = np.random.default_rng(self.seed)
        self._groups = _make_kernel_groups(
            self.decimated_len, self.kernel_len, self.n_kernels, self.dilations, rng
        )
        X = self._transform(raw_windows)
        self._scaler = StandardScaler().fit(X)
        X = self._scaler.transform(X)
        self._clf = RidgeClassifier()
        self._clf.fit(X, y)
        self.classes_ = self._clf.classes_
        return self

    def decision_function(self, raw_windows: np.ndarray) -> np.ndarray:
        X = self._scaler.transform(self._transform(raw_windows))
        return self._clf.decision_function(X)

    def predict(self, raw_windows: np.ndarray) -> np.ndarray:
        X = self._scaler.transform(self._transform(raw_windows))
        return self._clf.predict(X)

    def predict_proba(self, raw_windows: np.ndarray) -> np.ndarray:
        """RidgeClassifier has no native predict_proba — softmax over its decision
        function, which is the standard way to turn a linear margin into a probability-
        like output for a model like this. Treated as uncalibrated until passed through
        backend/ml/calibration.py, same as the XGBoost baseline."""
        scores = self.decision_function(raw_windows)
        if scores.ndim == 1:  # binary case: sklearn returns a single column
            scores = np.column_stack([-scores, scores])
        exp = np.exp(scores - scores.max(axis=1, keepdims=True))
        return exp / exp.sum(axis=1, keepdims=True)
