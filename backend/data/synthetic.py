"""
Synthetic leaf-electrophysiology data generator — PlantHealth.

THIS MODULE PRODUCES SIMULATED DATA. It does not record a real plant. Every array,
file, and database row this module produces carries ``is_synthetic=True`` so that
flag can and must be threaded through the API, the database, and the UI without being
re-derived or forgotten anywhere downstream. See backend/data/README.md section
"What's modeled vs. what's invented" for the full justification of every constant below,
and ../../docs/decisions (on this machine: ~/Desktop/PlantHealth-Decisions) for why no
real public dataset could be used instead.

Physiology modeled (see README for literature basis):
  - A ~24h diurnal rhythm present in every class (dominant, slow).
  - healthy:  diurnal rhythm + electrode drift + sensor noise. Nothing else.
  - heat:     fast "variation potentials" — sharp, high-amplitude, seconds-to-minutes
              pulses, Poisson-arriving. Baseline largely unaffected.
  - drought:  slow baseline shift *and* a gradual decay in diurnal amplitude, both
              developing over days. Almost no fast spiking.
  - salinity: baseline shift (ionic effect at the root) ramping over days, plus a
              spiking rate between drought's (low) and heat's (high).
  - all real-world classes: 50 Hz mains hum residual, 1/f-like electrode drift,
    occasional movement artefacts — these are NOISE, not signal, and are added
    identically in *distribution* across classes (not correlated with label) except
    for the deliberately-injected BOD-incubator compressor confound described below.

The compressor confound (see backend/data/README.md and docs section 7 "confound
panel"): inside a refrigerated (BOD) incubator, the compressor cycles harder — and
therefore faster — the further the chamber setpoint sits from room temperature. Since
the heat treatment arm runs at the chamber's most extreme setpoint, its *temperature*
channel acquires a faster, higher-amplitude compressor ripple purely as a mechanical
artefact of the chamber, not the plant. This is injected deliberately
(``EnvironmentConfig.compressor_confound=True`` by default for ``chamber_type="incubator"``)
so the lab view's confound panel (section 7) has something real to catch, and so the
honest-metrics step (section 3) can demonstrate a model that scores well on heat by
reading the compressor instead of the plant.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterator, Literal, Tuple

import numpy as np
import pandas as pd

CLASS_LABELS = ("healthy", "drought", "heat", "salinity")
ClassLabel = Literal["healthy", "drought", "heat", "salinity"]
ChamberType = Literal["incubator", "growth_room", "greenhouse", "open_bench"]

SCHEMA_VERSION = "1.0"


# --------------------------------------------------------------------------------------
# Configuration — every physiological/instrument parameter lives here, nothing is a
# magic number buried in the generation code below.
# --------------------------------------------------------------------------------------


@dataclass
class HardwareConfig:
    """ADS1256 acquisition chain. fs_hz within the brief's stated 10-100 Hz range."""

    fs_hz: float = 10.0
    mains_hum_hz: float = 50.0
    adc_bits: int = 24


@dataclass
class LightCycleConfig:
    light_hours: float = 16.0
    dark_hours: float = 8.0
    lights_on_hour: float = 6.0  # hour-of-day (0-24) lights switch on


@dataclass
class NoiseConfig:
    """Artefacts present in every real recording, per section 1 of the brief.

    These are added at the *same* nominal rate/amplitude distribution for every
    class — i.e. they are not supposed to be predictive of class. (The one
    deliberate exception, the compressor confound, lives in EnvironmentConfig and
    is documented there precisely because it's meant to leak into the label.)
    """

    sensor_noise_std_mv: float = 0.08
    mains_hum_amplitude_mv: float = 0.15  # residual after the hardware notch filter
    electrode_drift_mv_per_sqrt_day: float = 0.6  # random-walk ("1/f-like") scale
    movement_rate_per_hour: float = 0.4
    movement_amplitude_mv: Tuple[float, float] = (3.0, 12.0)
    movement_duration_s: Tuple[float, float] = (0.5, 4.0)


@dataclass
class DiurnalConfig:
    base_amplitude_mv: float = 10.0
    second_harmonic_fraction: float = 0.25  # light-on/light-off asymmetry


@dataclass
class HeatConfig:
    """Fast variation potentials: tens of mV, seconds-to-minutes, sharp."""

    vp_rate_per_hour: float = 6.0
    vp_amplitude_mv: Tuple[float, float] = (15.0, 45.0)
    vp_duration_s: Tuple[float, float] = (5.0, 90.0)
    chamber_setpoint_delta_c: float = 10.0  # how much warmer than room temperature


@dataclass
class DroughtConfig:
    """Slow baseline shift + shrinking diurnal amplitude. Nothing fast."""

    baseline_drift_mv_per_day: float = 4.0
    diurnal_amplitude_decay_per_day: float = 0.12  # fractional, floored below at 0.3x
    spike_rate_per_hour: float = 0.05  # "nothing fast happens"


@dataclass
class SalinityConfig:
    """Baseline shift from root ionic change, spiking between drought's and heat's."""

    baseline_shift_total_mv: float = 25.0
    baseline_ramp_days: float = 3.0
    spike_rate_per_hour: float = 1.2
    spike_amplitude_mv: Tuple[float, float] = (6.0, 18.0)
    spike_duration_s: Tuple[float, float] = (2.0, 20.0)


@dataclass
class EnvironmentConfig:
    air_temp_base_c: float = 24.0
    air_temp_daily_swing_c: float = 2.0
    humidity_base_pct: float = 60.0
    humidity_daily_swing_pct: float = 8.0
    leaf_temp_offset_c: float = -0.5  # transpirational cooling, healthy baseline
    compressor_confound: bool = True
    compressor_period_min_at_delta0: float = 14.0  # cycle length near room temp
    compressor_period_min_at_max_delta: float = 3.0  # cycle length far from room temp
    compressor_ripple_c: float = 0.4


@dataclass
class PlantRecordingConfig:
    plant_id: str
    class_label: ClassLabel
    duration_days: float = 3.0
    seed: int = 0
    chamber_type: ChamberType = "incubator"
    hardware: HardwareConfig = field(default_factory=HardwareConfig)
    light: LightCycleConfig = field(default_factory=LightCycleConfig)
    noise: NoiseConfig = field(default_factory=NoiseConfig)
    diurnal: DiurnalConfig = field(default_factory=DiurnalConfig)
    heat: HeatConfig = field(default_factory=HeatConfig)
    drought: DroughtConfig = field(default_factory=DroughtConfig)
    salinity: SalinityConfig = field(default_factory=SalinityConfig)
    environment: EnvironmentConfig = field(default_factory=EnvironmentConfig)

    def to_json(self) -> str:
        return json.dumps(asdict(self), default=str)


# --------------------------------------------------------------------------------------
# Per-plant individual variability.
#
# Real plants of the same treatment arm are NOT identical: electrode contact quality
# differs, baseline potential differs, how strongly an individual expresses a stress
# differs. These per-plant random effects are threaded through the *entire* recording
# (same draw used at every timestep for a given plant), which is exactly what makes
# windows from the same plant correlated with each other — the mechanism leave-one-
# plant-out CV exists to respect and random window splitting ignores. See section 3
# of the brief and backend/ml/validation.py.
# --------------------------------------------------------------------------------------


@dataclass
class _PlantTraits:
    baseline_offset_mv: float
    diurnal_amplitude_mult: float
    diurnal_phase_jitter_hours: float
    severity_mult: float  # how strongly this individual expresses its class signature
    noise_level_mult: float  # electrode contact quality


def _draw_plant_traits(seed: int) -> _PlantTraits:
    rng = np.random.default_rng(seed)
    return _PlantTraits(
        baseline_offset_mv=float(rng.normal(0.0, 3.0)),
        diurnal_amplitude_mult=float(np.clip(rng.normal(1.0, 0.15), 0.5, 1.6)),
        diurnal_phase_jitter_hours=float(rng.normal(0.0, 0.5)),
        severity_mult=float(np.clip(rng.lognormal(0.0, 0.25), 0.4, 2.2)),
        noise_level_mult=float(np.clip(rng.lognormal(0.0, 0.2), 0.5, 2.0)),
    )


# --------------------------------------------------------------------------------------
# Signal components
# --------------------------------------------------------------------------------------


def _diurnal_phase(t_hours: np.ndarray, lights_on_hour: float, phase_jitter_hours: float) -> np.ndarray:
    return 2 * np.pi * (t_hours - lights_on_hour - phase_jitter_hours) / 24.0


def _diurnal_wave(t_hours: np.ndarray, cfg: PlantRecordingConfig, traits: _PlantTraits) -> np.ndarray:
    phase = _diurnal_phase(t_hours, cfg.light.lights_on_hour, traits.diurnal_phase_jitter_hours)
    shape = np.sin(phase) + cfg.diurnal.second_harmonic_fraction * np.sin(2 * phase - np.pi / 2)

    amplitude = cfg.diurnal.base_amplitude_mv * traits.diurnal_amplitude_mult
    if cfg.class_label == "drought":
        day = t_hours / 24.0
        decay = np.clip(1.0 - cfg.drought.diurnal_amplitude_decay_per_day * day, 0.3, 1.0)
        amplitude = amplitude * decay
    return amplitude * shape


def _baseline_shift(t_hours: np.ndarray, cfg: PlantRecordingConfig, traits: _PlantTraits) -> np.ndarray:
    day = t_hours / 24.0
    if cfg.class_label == "drought":
        return cfg.drought.baseline_drift_mv_per_day * day * traits.severity_mult
    if cfg.class_label == "salinity":
        ramp = np.clip(day / cfg.salinity.baseline_ramp_days, 0.0, 1.0)
        # smoothstep ramp rather than a sharp linear kink, for plausibility
        ramp = ramp * ramp * (3 - 2 * ramp)
        return cfg.salinity.baseline_shift_total_mv * ramp * traits.severity_mult
    return np.zeros_like(t_hours)


def _pulse_kernel(n: int, rise_frac: float = 0.15) -> np.ndarray:
    """Biexponential-ish pulse shape: fast rise, slower decay, unit peak."""
    x = np.linspace(0, 1, n)
    rise_n = max(1, int(n * rise_frac))
    kernel = np.empty(n)
    kernel[:rise_n] = 1 - np.exp(-np.linspace(0, 5, rise_n))
    decay = np.exp(-np.linspace(0, 5, n - rise_n))
    kernel[rise_n:] = decay
    return kernel / kernel.max()


def _add_poisson_events(
    signal: np.ndarray,
    fs_hz: float,
    duration_s: float,
    rate_per_hour: float,
    amplitude_range: Tuple[float, float],
    duration_range: Tuple[float, float],
    severity_mult: float,
    rng: np.random.Generator,
) -> None:
    """Add Poisson-arriving pulses in place. Shared by heat VPs, salinity/drought spikes,
    and movement artefacts — the only difference between "signal" and "artefact" events
    is the rate/amplitude/duration distribution passed in, which is the point: they are
    the same *kind* of event, distinguishable only statistically, same as in real data.
    """
    if rate_per_hour <= 0:
        return
    expected_events = rate_per_hour * duration_s / 3600.0
    n_events = rng.poisson(expected_events)
    if n_events == 0:
        return
    event_times_s = rng.uniform(0, duration_s, size=n_events)
    n_total = len(signal)
    for t0 in event_times_s:
        amp = rng.uniform(*amplitude_range) * severity_mult * rng.choice([-1.0, 1.0])
        dur_s = rng.uniform(*duration_range)
        n_samples = max(2, int(dur_s * fs_hz))
        start = int(t0 * fs_hz)
        end = min(n_total, start + n_samples)
        if end <= start:
            continue
        kernel = _pulse_kernel(end - start)
        signal[start:end] += amp * kernel


def _electrode_drift(n: int, fs_hz: float, mv_per_sqrt_day: float, noise_mult: float, rng: np.random.Generator) -> np.ndarray:
    """Random-walk approximation of 1/f-like electrode drift. Documented as an
    approximation, not a literal 1/f PSD synthesis — see README."""
    dt_days = 1.0 / (fs_hz * 86400.0)
    increment_std = mv_per_sqrt_day * noise_mult * np.sqrt(dt_days)
    increments = rng.normal(0.0, increment_std, size=n)
    return np.cumsum(increments)


def _compressor_ripple_c(
    t_hours: np.ndarray,
    setpoint_delta_c: float,
    max_delta_c: float,
    period_at_delta0_min: float,
    period_at_max_delta_min: float,
    ripple_amplitude_c: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """The confound: compressor cycle period shrinks (cycles faster) as |setpoint -
    room temp| grows, so the heat treatment arm's chamber temperature channel carries
    a faster ripple purely mechanically, independent of the plant.
    """
    frac = np.clip(abs(setpoint_delta_c) / max(max_delta_c, 1e-6), 0.0, 1.0)
    period_min = period_at_delta0_min + frac * (period_at_max_delta_min - period_at_delta0_min)
    period_hours = period_min / 60.0
    phase_offset = rng.uniform(0, 2 * np.pi)
    ripple = ripple_amplitude_c * (0.5 + 0.5 * frac) * np.sin(2 * np.pi * t_hours / period_hours + phase_offset)
    return ripple


# --------------------------------------------------------------------------------------
# Top-level generation
# --------------------------------------------------------------------------------------


def generate_plant_recording(cfg: PlantRecordingConfig) -> pd.DataFrame:
    """Generate one plant's full recording: electrical signal + environmental channels.

    Returns a DataFrame with one row per sample: timestamp_s, potential_mv, air_temp_c,
    humidity_pct, leaf_temp_c, plant_id, class_label, stressed, is_synthetic (always True).
    """
    rng = np.random.default_rng(cfg.seed)
    traits = _draw_plant_traits(cfg.seed)

    n = int(cfg.duration_days * 86400 * cfg.hardware.fs_hz)
    t_s = np.arange(n) / cfg.hardware.fs_hz
    t_hours = t_s / 3600.0

    # --- electrical signal ---
    signal = np.zeros(n)
    signal += traits.baseline_offset_mv
    signal += _diurnal_wave(t_hours, cfg, traits)
    signal += _baseline_shift(t_hours, cfg, traits)

    if cfg.class_label == "heat":
        _add_poisson_events(
            signal, cfg.hardware.fs_hz, n / cfg.hardware.fs_hz,
            cfg.heat.vp_rate_per_hour, cfg.heat.vp_amplitude_mv, cfg.heat.vp_duration_s,
            traits.severity_mult, rng,
        )
    elif cfg.class_label == "salinity":
        _add_poisson_events(
            signal, cfg.hardware.fs_hz, n / cfg.hardware.fs_hz,
            cfg.salinity.spike_rate_per_hour, cfg.salinity.spike_amplitude_mv, cfg.salinity.spike_duration_s,
            traits.severity_mult, rng,
        )
    elif cfg.class_label == "drought":
        # "nothing fast happens" — a very low rate of small spikes, not zero, because
        # real drought recordings aren't perfectly silent either.
        _add_poisson_events(
            signal, cfg.hardware.fs_hz, n / cfg.hardware.fs_hz,
            cfg.drought.spike_rate_per_hour, (2.0, 6.0), (2.0, 10.0),
            traits.severity_mult, rng,
        )

    # artefacts common to every class, same distribution regardless of label
    signal += cfg.noise.mains_hum_amplitude_mv * np.sin(2 * np.pi * cfg.hardware.mains_hum_hz * t_s)
    signal += _electrode_drift(n, cfg.hardware.fs_hz, cfg.noise.electrode_drift_mv_per_sqrt_day, traits.noise_level_mult, rng)
    _add_poisson_events(
        signal, cfg.hardware.fs_hz, n / cfg.hardware.fs_hz,
        cfg.noise.movement_rate_per_hour, cfg.noise.movement_amplitude_mv, cfg.noise.movement_duration_s,
        1.0, rng,
    )
    signal += rng.normal(0.0, cfg.noise.sensor_noise_std_mv * traits.noise_level_mult, size=n)

    # --- environmental channels ---
    env = cfg.environment
    diurnal_temp_phase = _diurnal_phase(t_hours, cfg.light.lights_on_hour, traits.diurnal_phase_jitter_hours)

    setpoint_delta_c = env_setpoint_delta(cfg)
    air_temp = env.air_temp_base_c + setpoint_delta_c + env.air_temp_daily_swing_c * np.sin(diurnal_temp_phase)

    if cfg.chamber_type == "incubator" and env.compressor_confound:
        air_temp += _compressor_ripple_c(
            t_hours, setpoint_delta_c, max_delta_c=cfg.heat.chamber_setpoint_delta_c,
            period_at_delta0_min=env.compressor_period_min_at_delta0,
            period_at_max_delta_min=env.compressor_period_min_at_max_delta,
            ripple_amplitude_c=env.compressor_ripple_c, rng=rng,
        )
    air_temp += rng.normal(0.0, 0.05, size=n)

    humidity = env.humidity_base_pct - env.humidity_daily_swing_pct * np.sin(diurnal_temp_phase)
    if cfg.class_label in ("drought", "salinity"):
        day = t_hours / 24.0
        humidity -= np.clip(day * 1.5, 0, 15) * traits.severity_mult * 0.3
    if cfg.class_label == "heat":
        humidity -= 5.0
    humidity = np.clip(humidity + rng.normal(0.0, 0.3, size=n), 10, 95)

    # transpirational cooling shrinks under drought/heat (stomatal closure)
    cooling = env.leaf_temp_offset_c
    if cfg.class_label in ("drought", "heat"):
        day = t_hours / 24.0
        cooling = cooling * np.clip(1.0 - 0.15 * day, 0.2, 1.0)
    leaf_temp = air_temp + cooling + rng.normal(0.0, 0.1, size=n)

    df = pd.DataFrame({
        "timestamp_s": t_s,
        "plant_id": cfg.plant_id,
        "class_label": cfg.class_label,
        "stressed": cfg.class_label != "healthy",
        "potential_mv": signal,
        "air_temp_c": air_temp,
        "humidity_pct": humidity,
        "leaf_temp_c": leaf_temp,
        "is_synthetic": True,
    })
    return df


def env_setpoint_delta(cfg: PlantRecordingConfig) -> float:
    """How far this plant's chamber setpoint sits from room temperature. Only the
    heat arm runs hot; other arms sit near the room baseline. This is what the
    compressor confound keys off of."""
    return cfg.heat.chamber_setpoint_delta_c if cfg.class_label == "heat" else 0.0


def generate_dataset(
    plants_per_class: int,
    duration_days: float,
    fs_hz: float,
    seed: int,
    classes: Tuple[str, ...] = CLASS_LABELS,
) -> Iterator[Tuple[str, pd.DataFrame]]:
    """Yield (plant_id, recording_df) one plant at a time, so callers can stream
    straight to disk instead of holding the whole dataset in memory."""
    plant_index = 0
    for class_label in classes:
        for i in range(plants_per_class):
            plant_id = f"{class_label}_{i:03d}"
            cfg = PlantRecordingConfig(
                plant_id=plant_id,
                class_label=class_label,  # type: ignore[arg-type]
                duration_days=duration_days,
                seed=seed + plant_index,
                hardware=HardwareConfig(fs_hz=fs_hz),
            )
            plant_index += 1
            yield plant_id, generate_plant_recording(cfg)


def write_dataset(
    out_dir: Path,
    plants_per_class: int,
    duration_days: float,
    fs_hz: float,
    seed: int,
) -> None:
    raw_dir = out_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    manifest_rows = []
    for plant_id, df in generate_dataset(plants_per_class, duration_days, fs_hz, seed):
        path = raw_dir / f"{plant_id}.parquet"
        df.to_parquet(path, index=False)
        manifest_rows.append({
            "plant_id": plant_id,
            "class_label": df["class_label"].iloc[0],
            "stressed": bool(df["stressed"].iloc[0]),
            "duration_days": duration_days,
            "fs_hz": fs_hz,
            "n_samples": len(df),
            "is_synthetic": True,
            "schema_version": SCHEMA_VERSION,
        })
        print(f"  wrote {path} ({len(df):,} samples)")

    manifest = pd.DataFrame(manifest_rows)
    manifest_path = out_dir / "manifest.csv"
    manifest.to_csv(manifest_path, index=False)
    print(f"\nWrote manifest for {len(manifest)} plants -> {manifest_path}")
    print("ALL DATA IN THIS DIRECTORY IS SYNTHETIC (is_synthetic=True). See backend/data/README.md.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, default=Path(__file__).parent / "generated")
    parser.add_argument("--plants-per-class", type=int, default=8)
    parser.add_argument("--duration-days", type=float, default=3.0)
    parser.add_argument("--fs-hz", type=float, default=10.0)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    write_dataset(args.out_dir, args.plants_per_class, args.duration_days, args.fs_hz, args.seed)


if __name__ == "__main__":
    main()
