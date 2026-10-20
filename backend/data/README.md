# Synthetic data generator

**Everything this generator produces is synthetic.** No real plant was measured. Every row
carries `is_synthetic=True`, and that flag is meant to be threaded through the database and
API unchanged all the way to the UI (a persistent "DEMO DATA" banner — see the honesty
requirements in the project brief). Do not strip this flag anywhere downstream.

## Why synthetic data at all

We searched Zenodo, Dryad, Figshare, PhysioNet, Kaggle, and the papers this brief named
(Chatterjee, Volkov, Fromm & Lautner, Simmi) for a real, public, directly usable dataset.
None exists that matches this project's exact setup: leaf-pair differential Ag/AgCl surface
potential + stem reference electrode, four classes (healthy/drought/heat/salinity) with
multi-day drought/salinity dynamics *and* fast heat transients in one consistent recording
protocol, per-plant labels (needed for leave-one-plant-out CV), freely downloadable. The full
search writeup, including what *does* exist and why each candidate doesn't fit, is in
`~/Desktop/PlantHealth-Decisions/02-real-data-search.md` on the machine this was built on.

## What's modeled vs. what's invented

| Element | Modeled on | What's invented |
|---|---|---|
| Diurnal rhythm present in all classes | General plant electrophysiology literature (Volkov) — surface potentials track light/dark cycles | Exact amplitude (10 mV base), exact waveform shape (sinusoid + 2nd harmonic for light/dark asymmetry) |
| Heat = fast "variation potentials" | Volkov's characterization of variation potentials: hydraulically-propagated, fast-rising, slower-decaying, tens of mV, seconds-to-minutes | Exact rate (6/hour), exact amplitude range (15–45 mV), exact pulse shape (biexponential kernel) |
| Drought = slow baseline shift + shrinking diurnal amplitude | General consensus across the drought-classification literature found in the search (Chatterjee et al.-style work; see the search writeup) that drought signatures develop over days, not seconds | Exact drift rate (4 mV/day), exact amplitude decay rate (12%/day) |
| Salinity = baseline shift + spiking between drought's and heat's | Ionic disruption at the root is well-established to shift baseline membrane/surface potentials; spike rate placed between drought and heat per the brief's explicit instruction | Exact ramp shape (smoothstep over 3 days), exact spike rate/amplitude |
| 50 Hz mains hum, electrode drift, movement artefacts | Standard real-world EEG/biopotential acquisition artefacts, explicitly called out in the brief | Exact amplitudes; electrode drift modeled as a scaled random walk (√t scaling), which is a common *approximation* of 1/f noise, not a literal 1/f power-spectrum synthesis |
| Compressor confound on chamber temperature | Real BOD/refrigerated incubator physics — compressor duty cycle increases as the setpoint moves further from ambient | The specific period-vs-delta relationship (14 min near ambient → 3 min at the heat arm's setpoint) is invented to be *illustrative*, not measured from a real chamber |
| Per-plant individual variability (baseline offset, diurnal amplitude, phase jitter, stress severity, electrode contact quality) | Biological reality — no two plants or electrode placements are identical | All specific distributions |

**If you only remember one thing:** every number in `synthetic.py`'s dataclasses is a
documented guess calibrated to "looks like the described physiology," not a measured
constant. Treat it as a placeholder for real calibration data if/when this becomes available
(see the lab onboarding flow's "ground-truth assay data" upload — use that path to recalibrate
rather than editing these constants by hand).

## Known limitation: sampling rate vs. mains hum

The default `fs_hz=10` is at the low end of the ADS1256's stated 10–100 Hz range. At 10 Hz,
the Nyquist frequency is 5 Hz, so a literal 50 Hz sinusoid injected into the digital signal
aliases rather than appearing at 50 Hz — this is a simplification of the real signal chain
(which has an *analog* notch filter before the ADC, so the ADC itself never needs to resolve
50 Hz directly; only the imperfect residual matters, and that residual's true spectral shape
post-notch isn't modeled precisely here). If you need the hum to be frequency-domain
inspectable at its nominal 50 Hz, generate with `--fs-hz 100` or higher. See
`notebooks/01_synthetic_data_sanity_check.ipynb` section 3 for a worked example of this
caveat.

## Usage

```bash
cd backend
source .venv/bin/activate
python data/synthetic.py --plants-per-class 8 --duration-days 3 --fs-hz 10 --seed 42 \
    --out-dir data/generated
```

Writes one Parquet file per plant to `data/generated/raw/<plant_id>.parquet` (columns:
`timestamp_s, plant_id, class_label, stressed, potential_mv, air_temp_c, humidity_pct,
leaf_temp_c, is_synthetic`) plus `data/generated/manifest.csv` listing every plant with its
class, sample count, and generation parameters.

Defaults are chosen to be runnable on a laptop in seconds, **not** to match any particular
real experiment's scale — a full literature-scale recording (weeks, 50–100 Hz) is supported
by the same code via `--duration-days` / `--fs-hz`, it just takes longer and produces much
larger files. `data/generated/` is gitignored; regenerate it rather than committing it.

## Reproducibility

Every plant's RNG is seeded deterministically (`--seed` + plant index), so a given
`--seed`/`--plants-per-class`/`--duration-days`/`--fs-hz` combination always produces the
same dataset. The per-plant config is embedded in the generation code path, not persisted
per-file beyond the manifest's summary columns — rerun with the same flags to regenerate
byte-identical data.

## Why per-plant variability matters for validation

Each plant draws its own baseline offset, diurnal amplitude multiplier, phase jitter, stress
severity multiplier, and noise level from a plant-specific seed, and those draws are reused
at *every* timestep of that plant's recording. That's what makes windows from the same plant
correlated with each other — the exact leakage mechanism that makes random window splitting
give inflated, dishonest accuracy, and the reason this project's validation (`backend/ml/`)
uses **leave-one-plant-out** cross-validation, never a random split. See
`backend/ml/README.md` once step 2 is built.
