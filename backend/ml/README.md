# ML pipeline

`python ml/train.py --data-dir data/generated` runs the whole thing end to end and prints
the honest report. Needs `backend/data/generated/` to exist first — see
`backend/data/README.md` for how to generate it.

## Pipeline

1. **Features** (`features.py`): sliding windows at 5 min and 30 min (50% overlap). Per
   window: variance, skew, kurtosis, IQR, Hjorth mobility/complexity, crest/shape/impulse
   factor, zero-crossing rate, 8 wavelet-packet energies (db4, level 3), plus the
   environmental channels (air temp, humidity, leaf temp — mean/std within the window) as
   separate features, exactly per the brief.
2. **Models** (`models.py`): XGBoost on the engineered features (the baseline). A
   **simplified** MiniRocket-like transform (random dilated convolution kernels + PPV
   pooling + RidgeClassifier) on raw 30-min windows, for the brief's "also try... MiniRocket
   on raw windows" comparison.
3. **Validation** (`validation.py`) — **the most important file in this pipeline.**
   `leave_one_plant_out_cv()` is the number to trust. `inflated_random_split_cv()` exists
   *only* to print next to it as a labelled example of what not to do — see the module
   docstring for exactly why windows from the same plant leak under a random split.
4. **Calibration** (`calibration.py`): isotonic regression, one-vs-rest per class, fit on
   the leave-one-plant-out *out-of-fold* predictions (never in-sample). Brier score reported
   before/after.
5. **Explainability** (`explain.py`): SHAP TreeExplainer on the final XGBoost model.
6. **Orchestration** (`train.py`): runs all of the above, saves artifacts, prints the report.

## What's simplified, and why

- **MiniRocket-like, not MiniRocket.** `MiniRocketLikeClassifier` is a from-scratch,
  simplified reimplementation of the *idea* (random dilated kernels → proportion-of-positive-
  values pooling → linear classifier) — not the canonical algorithm from Dempster et al., and
  not validated against the reference `sktime`/`aeon` implementation. Kernel weights are drawn
  from `{-1, 1}` rather than the paper's fixed 84-combination weight set, and each raw window
  is decimated to a fixed length (400 samples, via plain linear-index subsampling, **not**
  an anti-alias-filtered decimation) before the transform runs, purely to keep runtime
  reasonable without a compiled (Numba/C) kernel implementation. If this project needs a
  faithful MiniRocket, swap in `sktime.transformations.panel.rocket.MiniRocket` — the
  honest/dishonest CV harness around it doesn't change.
- **Raw-window comparison runs only on the 30-min window size**, not both 5-min and 30-min
  like the feature-based XGBoost pipeline does. 5-min raw windows at even a modest sample
  rate are long enough (thousands of samples) that running the full LOPO×kernel grid at that
  scale meaningfully changes the runtime budget for very little comparative value — the
  30-min raw comparison already answers "does a raw-window model beat engineered features,
  honestly validated." Noted here rather than silently narrowed.
- **SHAP runs on a sample of windows** (capped at 2000) for the summary plot, not the full
  dataset — TreeExplainer is exact per-window regardless, the cap is just about plot
  rendering and iteration speed, not an approximation of the explanation itself.

## Honest result: the MiniRocket-like comparison lost, badly

On the shipped demo dataset: XGBoost on 30-min engineered features scores **0.811** honest
macro F1. The simplified MiniRocket-like transform on the same 30-min raw windows scores
**0.175** — below the 0.25 chance level for 4 balanced classes, and its "inflated" random-
split number (0.258) is barely above chance either. This was checked for an outright bug
(wrong label alignment, transposed arrays) rather than accepted at face value — the result
held up under inspection, and three of this simplified transform's specific choices explain
it plausibly:

1. **Kernel weights are mean-centered** (`models.py::_make_kernel_groups`), a real MiniRocket
   design choice that makes PPV pooling invariant to a window's baseline level — intentional,
   because baseline offset shouldn't matter to a *shape* detector. But drought and salinity's
   signatures in this project are substantially *about* baseline shift (see
   `backend/data/README.md`), so mean-centering throws away exactly the information those two
   classes depend on most.
2. **Decimation to 400 points from an 18,000-sample window** (a plain linear-index subsample,
   not anti-alias-filtered) can skip over short heat spikes (as brief as 5s = 50 raw samples,
   spanning roughly one decimated sample) entirely in a given window, and PPV pooling then
   averages whatever response there is across all ~400 output positions — diluting a spike's
   contribution to near-nothing.
3. **32 plants is not a lot of training signal for ~300 largely arbitrary PPV features** —
   high-dimensional, weakly-structured features with few independent plants is a classic
   overfitting regime, and `RidgeClassifier` doesn't strongly regularize against that here.

This is reported as the honest finding it is, not tuned away — the brief asked to "compare
them honestly," and the honest comparison is that the engineered, physiology-motivated
feature pipeline substantially outperforms this particular simplified raw-window approach on
this dataset. See `~/Desktop/PlantHealth-Decisions/05-ml-pipeline.md` for the reasoning
trail. If this project needs a competitive raw-window baseline, swap in the canonical
`sktime`/`aeon` MiniRocket implementation rather than tuning this one — see "What's
simplified" above.

## What these numbers do and do not mean

Every metric in `reports/metrics.json` and this pipeline's console output is computed on
**synthetic data**. They demonstrate that the pipeline — feature extraction, honest
validation, calibration, explainability — actually works end to end. They say **nothing**
about how this would perform on a real plant. Do not quote the leave-one-plant-out accuracy
number as "the model's accuracy" without that caveat, here or anywhere downstream (the lab
metrics page is required to state this plainly — see section 8 of the brief).

The **inflated random-split number is never the model's reported accuracy anywhere in this
project** — not in the API, not in the UI, not in the admin model registry. It exists solely
as the demonstrated contrast documented in `validation.py`.

## Confound finding (not hypothetical — this showed up in the actual run)

The SHAP summary (`reports/shap_summary.png`) on the real dataset shows `env_air_temp_mean_c`
and `env_air_temp_std_c` as the top two features overall, with `env_air_temp_std_c`'s
contribution concentrated almost entirely on the **heat** class. `backend/data/synthetic.py`
deliberately injects a faster/stronger compressor-duty-cycle ripple into exactly that channel
for the heat arm (its setpoint deviates furthest from room temperature). `train.py` quantifies
this directly as a confound ablation — electrical-signal-only features vs. signal+environment,
both honestly leave-one-plant-out validated:

| Features | Honest accuracy | Honest macro F1 |
|---|---|---|
| Electrical signal only (18 features) | 61.1% | 0.616 |
| Signal + environment (22 features) | 81.1% | 0.811 |

**Environment features account for +20.0 accuracy points.** Some of that is legitimate —
real plants genuinely respond to temperature and humidity — but given the deliberately
injected compressor artefact, a meaningful share is plausibly the chamber, not the plant.
This is reported in `reports/metrics.json` (`confound_ablation`) and
`models/metadata.json` (`confound_ablation_accuracy_points_from_environment`), and is kept
in the model rather than quietly fixed by dropping environment features — see
`~/Desktop/PlantHealth-Decisions/06-confound-finding.md` for why. The lab view's confound
panel (brief section 7) is built around surfacing exactly this.

## Reports

`reports/metrics.json` — the full honest report (both window sizes × XGBoost, honest vs.
inflated; the MiniRocket-like comparison; calibration Brier scores). `reports/shap_summary.png`
and `reports/calibration_curve.png` — the corresponding plots. These are committed (small
files) as the "something working" proof for this build step; regenerate with `train.py`
rather than hand-editing.

## Artifacts consumed by the API (step 3+)

`models/xgboost_model.joblib`, `models/calibrator.joblib`, `models/label_encoder.joblib`,
`models/metadata.json` — gitignored (regenerate via `train.py`), this is what
`backend/api/` loads to serve predictions. `metadata.json` carries the honest
leave-one-plant-out accuracy for the admin model registry (section 10) and the feature/window
config the API needs to reproduce feature extraction identically at inference time.
