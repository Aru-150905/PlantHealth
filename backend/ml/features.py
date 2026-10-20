"""
Sliding-window feature extraction — PlantHealth.

Per section 3 of the brief: sliding windows at two scales (5 min and 30 min), per-window
statistical + Hjorth + waveform-shape + wavelet-packet-energy features on the electrical
signal, plus the logged environmental channels as separate features.

Every feature here is computed independently per window, per plant. Nothing here looks
across plants or across windows from a different recording — that's what keeps
leave-one-plant-out CV (backend/ml/validation.py) honest: the *features* don't leak,
only a naive *split* would.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import numpy as np
import pandas as pd
import pywt
from scipy import stats

FEATURE_COLUMNS_SIGNAL = [
    "variance", "skew", "kurtosis", "iqr",
    "hjorth_mobility", "hjorth_complexity",
    "crest_factor", "shape_factor", "impulse_factor",
    "zero_crossing_rate",
]
WAVELET = "db4"
WAVELET_MAXLEVEL = 3  # 2**3 = 8 leaf-node energies


@dataclass
class WindowConfig:
    window_minutes: float
    overlap_frac: float = 0.5  # 50% overlap between consecutive windows


def _hjorth(x: np.ndarray) -> tuple[float, float]:
    """Hjorth mobility and complexity. Standard definitions:
    mobility   = sqrt(var(x') / var(x))
    complexity = mobility(x') / mobility(x)
    """
    dx = np.diff(x)
    ddx = np.diff(dx)
    var_x, var_dx, var_ddx = np.var(x), np.var(dx), np.var(ddx)
    if var_x < 1e-12 or var_dx < 1e-12:
        return 0.0, 0.0
    mobility = np.sqrt(var_dx / var_x)
    mobility_dx = np.sqrt(var_ddx / var_dx) if var_ddx > 1e-12 else 0.0
    complexity = mobility_dx / mobility if mobility > 1e-12 else 0.0
    return float(mobility), float(complexity)


def _waveform_shape_factors(x: np.ndarray) -> tuple[float, float, float]:
    """Crest factor, shape factor, impulse factor — standard condition-monitoring
    waveform descriptors, computed on the window with its mean removed so they
    describe shape rather than being dominated by the diurnal offset."""
    x0 = x - x.mean()
    rms = np.sqrt(np.mean(x0 ** 2))
    mean_abs = np.mean(np.abs(x0))
    peak = np.max(np.abs(x0))
    eps = 1e-9
    crest_factor = peak / (rms + eps)
    shape_factor = rms / (mean_abs + eps)
    impulse_factor = peak / (mean_abs + eps)
    return float(crest_factor), float(shape_factor), float(impulse_factor)


def _zero_crossing_rate(x: np.ndarray) -> float:
    x0 = x - x.mean()
    signs = np.sign(x0)
    signs[signs == 0] = 1
    crossings = np.sum(signs[1:] != signs[:-1])
    return float(crossings / len(x))


def _wavelet_packet_energies(x: np.ndarray) -> np.ndarray:
    """Relative energy per leaf node of a wavelet packet decomposition. Normalized
    so the energies sum to 1 — makes them comparable across windows regardless of
    the window's overall amplitude (that's captured separately by variance)."""
    wp = pywt.WaveletPacket(data=x, wavelet=WAVELET, mode="symmetric", maxlevel=WAVELET_MAXLEVEL)
    leaves = [node.path for node in wp.get_level(WAVELET_MAXLEVEL, order="freq")]
    energies = np.array([np.sum(np.asarray(wp[path].data) ** 2) for path in leaves])
    total = energies.sum()
    return energies / total if total > 1e-12 else energies


def _signal_features(x: np.ndarray) -> dict:
    mobility, complexity = _hjorth(x)
    crest, shape, impulse = _waveform_shape_factors(x)
    feats = {
        "variance": float(np.var(x)),
        "skew": float(stats.skew(x)),
        "kurtosis": float(stats.kurtosis(x)),
        "iqr": float(np.percentile(x, 75) - np.percentile(x, 25)),
        "hjorth_mobility": mobility,
        "hjorth_complexity": complexity,
        "crest_factor": crest,
        "shape_factor": shape,
        "impulse_factor": impulse,
        "zero_crossing_rate": _zero_crossing_rate(x),
    }
    wpe = _wavelet_packet_energies(x)
    for i, e in enumerate(wpe):
        feats[f"wavelet_energy_{i}"] = float(e)
    return feats


def _window_bounds(n: int, window_n: int, step_n: int) -> Iterator[tuple[int, int]]:
    for start in range(0, n - window_n + 1, step_n):
        yield start, start + window_n


def extract_raw_windows(plant_df: pd.DataFrame, fs_hz: float, cfg: WindowConfig) -> tuple[np.ndarray, pd.DataFrame]:
    """Same window boundaries as extract_window_features, but returns the raw
    potential_mv arrays themselves (for backend/ml/models.py's MiniRocket-like
    transform, which operates on raw windows rather than engineered features) plus a
    metadata DataFrame (plant_id, class_label, stressed, window_start_s) aligned
    row-for-row with the returned array.
    """
    window_n = int(cfg.window_minutes * 60 * fs_hz)
    step_n = max(1, int(window_n * (1 - cfg.overlap_frac)))
    n = len(plant_df)
    potential = plant_df["potential_mv"].to_numpy()
    t_s = plant_df["timestamp_s"].to_numpy()
    plant_id = plant_df["plant_id"].iloc[0]
    class_label = plant_df["class_label"].iloc[0]
    stressed = bool(plant_df["stressed"].iloc[0])

    windows, meta = [], []
    for start, end in _window_bounds(n, window_n, step_n):
        windows.append(potential[start:end])
        meta.append({
            "plant_id": plant_id, "class_label": class_label,
            "stressed": stressed, "window_start_s": float(t_s[start]),
        })
    arr = np.stack(windows) if windows else np.empty((0, window_n))
    return arr, pd.DataFrame(meta)


def extract_window_features(plant_df: pd.DataFrame, fs_hz: float, cfg: WindowConfig) -> Iterator[dict]:
    """Yield one feature-row dict per sliding window for a single plant's recording.

    plant_df must have columns: timestamp_s, potential_mv, air_temp_c, humidity_pct,
    leaf_temp_c, plant_id, class_label, stressed, is_synthetic — i.e. exactly what
    backend/data/synthetic.py's generate_plant_recording() produces.
    """
    window_n = int(cfg.window_minutes * 60 * fs_hz)
    step_n = max(1, int(window_n * (1 - cfg.overlap_frac)))
    n = len(plant_df)
    if window_n > n:
        return

    potential = plant_df["potential_mv"].to_numpy()
    air_temp = plant_df["air_temp_c"].to_numpy()
    humidity = plant_df["humidity_pct"].to_numpy()
    leaf_temp = plant_df["leaf_temp_c"].to_numpy()
    t_s = plant_df["timestamp_s"].to_numpy()
    plant_id = plant_df["plant_id"].iloc[0]
    class_label = plant_df["class_label"].iloc[0]
    stressed = bool(plant_df["stressed"].iloc[0])

    for start, end in _window_bounds(n, window_n, step_n):
        row = {
            "plant_id": plant_id,
            "class_label": class_label,
            "stressed": stressed,
            "window_start_s": float(t_s[start]),
            "window_minutes": cfg.window_minutes,
            "is_synthetic": True,
        }
        row.update(_signal_features(potential[start:end]))
        # environmental channels as separate features, per the brief
        row["env_air_temp_mean_c"] = float(air_temp[start:end].mean())
        row["env_air_temp_std_c"] = float(air_temp[start:end].std())
        row["env_humidity_mean_pct"] = float(humidity[start:end].mean())
        row["env_leaf_temp_mean_c"] = float(leaf_temp[start:end].mean())
        yield row


def build_feature_table(raw_dir: Path, manifest: pd.DataFrame, fs_hz: float, cfg: WindowConfig) -> pd.DataFrame:
    """Read every plant's raw parquet and build one window-level feature table."""
    rows = []
    for plant_id in manifest["plant_id"]:
        plant_df = pd.read_parquet(raw_dir / f"{plant_id}.parquet")
        rows.extend(extract_window_features(plant_df, fs_hz, cfg))
    return pd.DataFrame(rows)


def feature_columns(df: pd.DataFrame) -> list[str]:
    """Columns that are actual model inputs — everything except identifiers/labels."""
    non_feature = {
        "plant_id", "class_label", "stressed", "window_start_s", "window_minutes",
        "is_synthetic",
    }
    return [c for c in df.columns if c not in non_feature]
