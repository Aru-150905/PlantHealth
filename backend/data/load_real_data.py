"""
Real-data loader — PlantHealth.

Converts real leaf-electrophysiology recordings into the exact schema
backend/ml/train.py already consumes (the same manifest.csv + raw/<plant_id>.parquet shape
backend/data/synthetic.py produces) — so training on real data is just:

    python data/load_real_data.py --sensor-dir /path/to/csvs --labels-csv /path/to/labels.csv \
        --out-dir data/real
    python ml/train.py --data-dir data/real

No changes to the ML pipeline itself. Every row this script writes is flagged
is_synthetic=False — see backend/data/README.md's "Loading real data" section for how that
flag propagates, and ~/Desktop/PlantHealth-Decisions/13-real-data-loader.md for why the exact
input format is deliberately kept flexible (column-mapping flags + auto-detected common
names) rather than hardcoded: the real export format wasn't known when this was written.

Two input layouts:
  --layout per-plant (default): --sensor-dir holds one CSV per plant; the plant_id is the
      filename stem (e.g. plant_07.csv -> plant_id "plant_07") unless --labels-csv maps
      filenames explicitly via a 'file' column.
  --layout single-file: --sensor-csv is one file with every plant's rows, distinguished by
      --plant-id-col.

Either way, a separate --labels-csv supplies the one thing no sensor log can: which
treatment arm (class_label) each plant was actually in. Minimum columns: plant_id,
class_label. class_label must be one of healthy/drought/heat/salinity.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from synthetic import CLASS_LABELS, SCHEMA_VERSION  # noqa: E402

REQUIRED_SIGNAL_FIELDS = ["potential_mv", "air_temp_c", "humidity_pct", "leaf_temp_c"]

# Auto-detected column-name candidates, tried in order, before falling back to erroring and
# asking the caller to pass the column explicitly. Covers the column-naming conventions most
# plant-electrophysiology DAQ/logging setups are likely to use — extend this list rather
# than hardcoding one assumed export format once you see the real files.
COLUMN_CANDIDATES = {
    "timestamp_s": ["timestamp_s", "timestamp", "time_s", "time", "t", "Time (s)", "elapsed_s"],
    "potential_mv": ["potential_mv", "voltage_mv", "signal_mv", "mv", "potential", "voltage", "mV"],
    "air_temp_c": ["air_temp_c", "air_temperature_c", "chamber_temp_c", "air_temp", "temp_c"],
    "humidity_pct": ["humidity_pct", "humidity", "rh_pct", "relative_humidity", "rh"],
    "leaf_temp_c": ["leaf_temp_c", "leaf_temperature_c", "leaf_temp"],
}


class LoadError(ValueError):
    pass


def _resolve_column(df: pd.DataFrame, field: str, override: str | None) -> str:
    if override:
        if override not in df.columns:
            raise LoadError(f"--{field.replace('_', '-')}-col '{override}' not found in columns {list(df.columns)}")
        return override
    for candidate in COLUMN_CANDIDATES[field]:
        if candidate in df.columns:
            return candidate
    raise LoadError(
        f"Could not find a column for '{field}' (tried {COLUMN_CANDIDATES[field]}). "
        f"Pass it explicitly, e.g. --{field.replace('_', '-')}-col <your column name>. "
        f"Columns present: {list(df.columns)}"
    )


def _infer_fs_hz(timestamps: np.ndarray, override: float | None) -> float:
    if override:
        return override
    diffs = np.diff(timestamps)
    diffs = diffs[diffs > 0]
    if len(diffs) == 0:
        raise LoadError("Could not infer sampling rate — timestamps aren't increasing. Pass --fs-hz explicitly.")
    median_dt = float(np.median(diffs))
    return round(1.0 / median_dt, 4)


def _load_one_plant_df(raw: pd.DataFrame, plant_id: str, class_label: str, cols: dict, fs_hz_override: float | None) -> pd.DataFrame:
    df = raw.rename(columns={v: k for k, v in cols.items()})[list(cols.keys())].copy()

    df = df.sort_values("timestamp_s").reset_index(drop=True)
    t0 = df["timestamp_s"].iloc[0]
    df["timestamp_s"] = df["timestamp_s"] - t0  # zero the clock, same convention as synthetic.py

    nan_counts = df[REQUIRED_SIGNAL_FIELDS].isna().sum()
    if nan_counts.any():
        raise LoadError(
            f"{plant_id}: NaN values found — {nan_counts[nan_counts > 0].to_dict()}. "
            f"Clean the source file (interpolate or drop those rows) and retry; this loader "
            f"does not silently impute missing sensor data."
        )

    fs_hz = _infer_fs_hz(df["timestamp_s"].to_numpy(), fs_hz_override)
    duration_s = float(df["timestamp_s"].iloc[-1])
    if duration_s < 30 * 60:
        print(f"  WARNING {plant_id}: only {duration_s / 60:.1f} min of data — shorter than the "
              f"default 30-min model window; feature extraction will yield 0 windows at that "
              f"size for this plant unless you retrain with a shorter --window-minutes.")

    df["plant_id"] = plant_id
    df["class_label"] = class_label
    df["stressed"] = class_label != "healthy"
    df["is_synthetic"] = False
    return df[["timestamp_s", "plant_id", "class_label", "stressed", *REQUIRED_SIGNAL_FIELDS, "is_synthetic"]], fs_hz


def load(
    out_dir: Path, labels_csv: Path, sensor_dir: Path | None, sensor_csv: Path | None, layout: str,
    plant_id_col: str, timestamp_col: str | None, potential_col: str | None,
    air_temp_col: str | None, humidity_col: str | None, leaf_temp_col: str | None, fs_hz_override: float | None,
) -> None:
    labels = pd.read_csv(labels_csv)
    if "plant_id" not in labels.columns or "class_label" not in labels.columns:
        raise LoadError(f"--labels-csv must have at least 'plant_id' and 'class_label' columns; got {list(labels.columns)}")
    bad_classes = set(labels["class_label"]) - set(CLASS_LABELS)
    if bad_classes:
        raise LoadError(f"--labels-csv has class_label values not in {CLASS_LABELS}: {bad_classes}")

    raw_out = out_dir / "raw"
    raw_out.mkdir(parents=True, exist_ok=True)
    manifest_rows = []
    skipped = []

    def _cols_for(df: pd.DataFrame) -> dict:
        return {
            "timestamp_s": _resolve_column(df, "timestamp_s", timestamp_col),
            "potential_mv": _resolve_column(df, "potential_mv", potential_col),
            "air_temp_c": _resolve_column(df, "air_temp_c", air_temp_col),
            "humidity_pct": _resolve_column(df, "humidity_pct", humidity_col),
            "leaf_temp_c": _resolve_column(df, "leaf_temp_c", leaf_temp_col),
        }

    if layout == "per-plant":
        if sensor_dir is None:
            raise LoadError("--layout per-plant requires --sensor-dir")
        file_map = dict(zip(labels.get("file", labels["plant_id"] + ".csv"), labels["plant_id"])) \
            if "file" in labels.columns else None
        csv_files = sorted(sensor_dir.glob("*.csv"))
        if not csv_files:
            raise LoadError(f"No .csv files found in {sensor_dir}")
        for path in csv_files:
            plant_id = file_map.get(path.name) if file_map else path.stem
            row = labels[labels["plant_id"] == plant_id]
            if row.empty:
                skipped.append((path.name, "no matching row in --labels-csv"))
                continue
            class_label = row["class_label"].iloc[0]
            try:
                raw = pd.read_csv(path)
                cols = _cols_for(raw)
                df, fs_hz = _load_one_plant_df(raw, plant_id, class_label, cols, fs_hz_override)
            except LoadError as e:
                skipped.append((path.name, str(e)))
                continue
            df.to_parquet(raw_out / f"{plant_id}.parquet", index=False)
            manifest_rows.append({
                "plant_id": plant_id, "class_label": class_label, "stressed": class_label != "healthy",
                "duration_days": df["timestamp_s"].iloc[-1] / 86400, "fs_hz": fs_hz, "n_samples": len(df),
                "is_synthetic": False, "schema_version": SCHEMA_VERSION,
            })
            print(f"  wrote {plant_id}.parquet ({len(df):,} samples, {fs_hz} Hz, class={class_label})")

    elif layout == "single-file":
        if sensor_csv is None:
            raise LoadError("--layout single-file requires --sensor-csv")
        raw_all = pd.read_csv(sensor_csv)
        if plant_id_col not in raw_all.columns:
            raise LoadError(f"--plant-id-col '{plant_id_col}' not found in columns {list(raw_all.columns)}")
        cols = _cols_for(raw_all)
        for plant_id, group in raw_all.groupby(plant_id_col):
            row = labels[labels["plant_id"] == plant_id]
            if row.empty:
                skipped.append((str(plant_id), "no matching row in --labels-csv"))
                continue
            class_label = row["class_label"].iloc[0]
            try:
                df, fs_hz = _load_one_plant_df(group, str(plant_id), class_label, cols, fs_hz_override)
            except LoadError as e:
                skipped.append((str(plant_id), str(e)))
                continue
            df.to_parquet(raw_out / f"{plant_id}.parquet", index=False)
            manifest_rows.append({
                "plant_id": plant_id, "class_label": class_label, "stressed": class_label != "healthy",
                "duration_days": df["timestamp_s"].iloc[-1] / 86400, "fs_hz": fs_hz, "n_samples": len(df),
                "is_synthetic": False, "schema_version": SCHEMA_VERSION,
            })
            print(f"  wrote {plant_id}.parquet ({len(df):,} samples, {fs_hz} Hz, class={class_label})")
    else:
        raise LoadError(f"Unknown --layout {layout!r} — must be 'per-plant' or 'single-file'")

    if not manifest_rows:
        raise LoadError("No plants loaded successfully — see skipped list above. Nothing written.")

    manifest = pd.DataFrame(manifest_rows)
    manifest.to_csv(out_dir / "manifest.csv", index=False)
    print(f"\nWrote manifest for {len(manifest)} plants -> {out_dir / 'manifest.csv'}")
    print(f"Classes: {manifest['class_label'].value_counts().to_dict()}")
    if skipped:
        print(f"\n{len(skipped)} file(s)/plant(s) skipped:")
        for name, reason in skipped:
            print(f"  {name}: {reason}")
    print("\nAll rows flagged is_synthetic=False. Train with:")
    print(f"  python ml/train.py --data-dir {out_dir} --fs-hz {manifest['fs_hz'].median()}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out-dir", type=Path, required=True, help="e.g. data/real")
    parser.add_argument("--labels-csv", type=Path, required=True, help="columns: plant_id, class_label[, file]")
    parser.add_argument("--layout", choices=["per-plant", "single-file"], default="per-plant")
    parser.add_argument("--sensor-dir", type=Path, help="directory of per-plant CSVs (--layout per-plant)")
    parser.add_argument("--sensor-csv", type=Path, help="one combined CSV (--layout single-file)")
    parser.add_argument("--plant-id-col", default="plant_id", help="only used with --layout single-file")
    parser.add_argument("--timestamp-col")
    parser.add_argument("--potential-col")
    parser.add_argument("--air-temp-col")
    parser.add_argument("--humidity-col")
    parser.add_argument("--leaf-temp-col")
    parser.add_argument("--fs-hz", type=float, help="override auto-detected sampling rate for every plant")
    args = parser.parse_args()

    try:
        load(
            args.out_dir, args.labels_csv, args.sensor_dir, args.sensor_csv, args.layout,
            args.plant_id_col, args.timestamp_col, args.potential_col,
            args.air_temp_col, args.humidity_col, args.leaf_temp_col, args.fs_hz,
        )
    except LoadError as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
