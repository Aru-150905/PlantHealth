"""
backend/data/load_real_data.py — the converter from real sensor exports into the
manifest.csv + raw/<plant_id>.parquet shape backend/ml/train.py consumes. These tests use
small fabricated CSVs (not real hardware data, which doesn't exist in this repo) to check
the loader's actual behavior: column auto-detection, both input layouts, NaN rejection,
bad-class-label rejection, and — the thing that matters most — is_synthetic=False on every
row it writes.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "data"))
from load_real_data import LoadError, load  # noqa: E402


def _make_plant_csv(path: Path, n: int = 5000, time_col="Time (s)", seed: int = 0) -> None:
    rng = np.random.default_rng(seed)
    t = np.arange(n) / 10.0
    pd.DataFrame({
        time_col: t,
        "voltage_mv": rng.normal(0, 5, n),
        "air_temp_c": rng.normal(25, 0.5, n),
        "humidity_pct": rng.normal(55, 2, n),
        "leaf_temp_c": rng.normal(24, 0.5, n),
    }).to_csv(path, index=False)


def _labels_csv(path: Path, rows: list[dict]) -> None:
    pd.DataFrame(rows).to_csv(path, index=False)


def test_per_plant_layout_with_nondefault_column_names(tmp_path):
    sensor_dir = tmp_path / "sensors"
    sensor_dir.mkdir()
    _make_plant_csv(sensor_dir / "p1.csv", seed=1)
    _make_plant_csv(sensor_dir / "p2.csv", seed=2)
    labels_path = tmp_path / "labels.csv"
    _labels_csv(labels_path, [
        {"plant_id": "p1", "class_label": "healthy"},
        {"plant_id": "p2", "class_label": "drought"},
    ])
    out_dir = tmp_path / "out"

    load(out_dir, labels_path, sensor_dir, None, "per-plant", "plant_id", None, None, None, None, None, None)

    manifest = pd.read_csv(out_dir / "manifest.csv")
    assert set(manifest["plant_id"]) == {"p1", "p2"}
    assert (manifest["is_synthetic"] == False).all()  # noqa: E712
    assert set(manifest["class_label"]) == {"healthy", "drought"}

    df = pd.read_parquet(out_dir / "raw" / "p1.parquet")
    assert list(df.columns) == ["timestamp_s", "plant_id", "class_label", "stressed", "potential_mv", "air_temp_c", "humidity_pct", "leaf_temp_c", "is_synthetic"]
    assert (df["is_synthetic"] == False).all()  # noqa: E712
    assert df["timestamp_s"].iloc[0] == 0  # zeroed to start of recording


def test_single_file_layout(tmp_path):
    sensor_dir = tmp_path / "sensors"
    sensor_dir.mkdir()
    _make_plant_csv(sensor_dir / "p1.csv", seed=1)
    _make_plant_csv(sensor_dir / "p2.csv", seed=2)
    combined = pd.concat([
        pd.read_csv(sensor_dir / "p1.csv").assign(plant=  "p1"),
        pd.read_csv(sensor_dir / "p2.csv").assign(plant="p2"),
    ])
    combined_path = tmp_path / "combined.csv"
    combined.to_csv(combined_path, index=False)
    labels_path = tmp_path / "labels.csv"
    _labels_csv(labels_path, [
        {"plant_id": "p1", "class_label": "heat"},
        {"plant_id": "p2", "class_label": "salinity"},
    ])
    out_dir = tmp_path / "out"

    load(out_dir, labels_path, None, combined_path, "single-file", "plant", None, None, None, None, None, None)

    manifest = pd.read_csv(out_dir / "manifest.csv")
    assert set(manifest["plant_id"]) == {"p1", "p2"}
    assert set(manifest["class_label"]) == {"heat", "salinity"}


def test_rejects_bad_class_label(tmp_path):
    sensor_dir = tmp_path / "sensors"
    sensor_dir.mkdir()
    _make_plant_csv(sensor_dir / "p1.csv")
    labels_path = tmp_path / "labels.csv"
    _labels_csv(labels_path, [{"plant_id": "p1", "class_label": "wilted"}])

    with pytest.raises(LoadError, match="not in"):
        load(tmp_path / "out", labels_path, sensor_dir, None, "per-plant", "plant_id", None, None, None, None, None, None)


def test_skips_plant_with_nan_values_but_loads_the_rest(tmp_path):
    sensor_dir = tmp_path / "sensors"
    sensor_dir.mkdir()
    _make_plant_csv(sensor_dir / "p1.csv", seed=1)
    _make_plant_csv(sensor_dir / "p2.csv", seed=2)
    df = pd.read_csv(sensor_dir / "p1.csv")
    df.loc[10, "voltage_mv"] = None
    df.to_csv(sensor_dir / "p1.csv", index=False)
    labels_path = tmp_path / "labels.csv"
    _labels_csv(labels_path, [
        {"plant_id": "p1", "class_label": "healthy"},
        {"plant_id": "p2", "class_label": "drought"},
    ])
    out_dir = tmp_path / "out"

    load(out_dir, labels_path, sensor_dir, None, "per-plant", "plant_id", None, None, None, None, None, None)

    manifest = pd.read_csv(out_dir / "manifest.csv")
    assert set(manifest["plant_id"]) == {"p2"}, "p1 should be skipped for NaNs, p2 should still load"
    assert not (out_dir / "raw" / "p1.parquet").exists()


def test_plant_with_no_matching_label_is_skipped_not_fatal(tmp_path):
    sensor_dir = tmp_path / "sensors"
    sensor_dir.mkdir()
    _make_plant_csv(sensor_dir / "p1.csv", seed=1)
    _make_plant_csv(sensor_dir / "unlabeled.csv", seed=2)
    labels_path = tmp_path / "labels.csv"
    _labels_csv(labels_path, [{"plant_id": "p1", "class_label": "healthy"}])
    out_dir = tmp_path / "out"

    load(out_dir, labels_path, sensor_dir, None, "per-plant", "plant_id", None, None, None, None, None, None)

    manifest = pd.read_csv(out_dir / "manifest.csv")
    assert set(manifest["plant_id"]) == {"p1"}


def test_raises_clearly_when_all_plants_fail(tmp_path):
    sensor_dir = tmp_path / "sensors"
    sensor_dir.mkdir()
    _make_plant_csv(sensor_dir / "p1.csv")
    labels_path = tmp_path / "labels.csv"
    _labels_csv(labels_path, [{"plant_id": "someone_else", "class_label": "healthy"}])

    with pytest.raises(LoadError, match="No plants loaded"):
        load(tmp_path / "out", labels_path, sensor_dir, None, "per-plant", "plant_id", None, None, None, None, None, None)


def test_explicit_column_override_takes_precedence_over_autodetect(tmp_path):
    sensor_dir = tmp_path / "sensors"
    sensor_dir.mkdir()
    # a column name NOT in the auto-detect candidate list at all
    pd.DataFrame({
        "my_weird_time_column": np.arange(3000) / 10.0,
        "my_weird_signal": np.random.default_rng(0).normal(0, 5, 3000),
        "air_temp_c": np.full(3000, 25.0),
        "humidity_pct": np.full(3000, 55.0),
        "leaf_temp_c": np.full(3000, 24.0),
    }).to_csv(sensor_dir / "p1.csv", index=False)
    labels_path = tmp_path / "labels.csv"
    _labels_csv(labels_path, [{"plant_id": "p1", "class_label": "healthy"}])
    out_dir = tmp_path / "out"

    load(
        out_dir, labels_path, sensor_dir, None, "per-plant", "plant_id",
        "my_weird_time_column", "my_weird_signal", None, None, None, None,
    )
    assert (out_dir / "raw" / "p1.parquet").exists()


def test_fs_hz_is_inferred_from_timestamps(tmp_path):
    sensor_dir = tmp_path / "sensors"
    sensor_dir.mkdir()
    # 20 Hz instead of the default fixture's 10 Hz
    n = 6000
    pd.DataFrame({
        "timestamp_s": np.arange(n) / 20.0,
        "potential_mv": np.zeros(n),
        "air_temp_c": np.full(n, 25.0),
        "humidity_pct": np.full(n, 55.0),
        "leaf_temp_c": np.full(n, 24.0),
    }).to_csv(sensor_dir / "p1.csv", index=False)
    labels_path = tmp_path / "labels.csv"
    _labels_csv(labels_path, [{"plant_id": "p1", "class_label": "healthy"}])
    out_dir = tmp_path / "out"

    load(out_dir, labels_path, sensor_dir, None, "per-plant", "plant_id", None, None, None, None, None, None)

    manifest = pd.read_csv(out_dir / "manifest.csv")
    assert abs(manifest["fs_hz"].iloc[0] - 20.0) < 0.01
