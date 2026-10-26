from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import Role, Tier


class TenantOut(BaseModel):
    id: str
    name: str
    tier: Tier
    role: Role
    suspended: bool
    onboarding_completed: bool
    language: str
    guide_character: str | None = None

    model_config = ConfigDict(from_attributes=True)


class RegisterRequest(BaseModel):
    tenant_name: str
    email: EmailStr
    password: str = Field(min_length=8)
    tier: Tier = Tier.basic
    # chosen on the welcome/login screens before an account exists — see
    # frontend/src/state/locale.ts; becomes the tenant's initial language
    language: str = Field(default="en", min_length=2, max_length=10)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant: TenantOut


class UserOut(BaseModel):
    id: str
    email: str
    is_admin: bool
    tenant: TenantOut

    model_config = ConfigDict(from_attributes=True)


class RoleUpdateRequest(BaseModel):
    role: Role


class LanguageUpdateRequest(BaseModel):
    language: str = Field(min_length=2, max_length=10)


class GuideUpdateRequest(BaseModel):
    guide_character: Literal["didi", "bhaiya"]


# --------------------------------------------------------------------------------------
# Section 5 onboarding. Every field is Optional with the brief's own stated default for
# the farmer flow ("skippable with sensible defaults") — nothing is silently required.
# The lab flow's fields are mostly required (brief: "a single dense form... this user would
# rather see everything at once"), but still Optional here so a partial-save pattern is
# possible later without a schema change; required-ness for lab is enforced as a UX
# affordance in the frontend form, not at this layer.
# --------------------------------------------------------------------------------------


class FieldLayout(BaseModel):
    kind: str = "rows"  # "rows" | "grid" | "rough"
    rows: int | None = None
    spacing_m: float | None = None
    grid_width: int | None = None
    grid_height: int | None = None


class FarmerOnboardingRequest(BaseModel):
    crop: str = "tomato"
    plant_count: int | None = None
    plant_count_band: str | None = None  # e.g. "100-500" when given as a slider band, not a number
    sensor_count: int = Field(default=1, ge=1)
    field_layout: FieldLayout = Field(default_factory=FieldLayout)
    watering_method: str = "drip"  # drip | flood | sprinkler | rain_fed
    salinity_history: str = "unsure"  # "yes" | "no" | "unsure"
    region: str | None = None
    season: str | None = None
    alert_threshold: str = "fairly_sure"  # "fairly_sure" | "tell_me_early"
    language: str = "en"


class LabOnboardingRequest(BaseModel):
    species: str = "tomato"  # tomato | arabidopsis | rice | maize | other
    species_other: str | None = None
    n_plants: int | None = None
    n_treatment_arms: int | None = None
    stresses: list[str] = Field(default_factory=lambda: ["drought", "heat", "salinity"])
    replicates_per_arm: int | None = None
    chamber_type: str = "incubator"  # incubator | growth_room | greenhouse | open_bench
    light_hours_on: float = 16.0
    light_hours_off: float = 8.0
    light_switch_time: str | None = None  # e.g. "06:00"
    sampling_rate_hz: float = 10.0
    electrode_config: str | None = None
    n_channels: int | None = None
    amplifier_gain: float | None = None
    has_ground_truth_assay: bool = False
    show_random_split_comparison: bool = False  # LOPO is always used regardless — section 3
    export_retention_preference: str | None = None


class OnboardingOut(BaseModel):
    role: Role
    onboarding_completed: bool
    farmer: dict | None = None
    lab: dict | None = None
    # server-computed, never trusted from the client — section 4's coverage ratio
    coverage_ratio_text: str | None = None
    confound_panel_enabled: bool | None = None


class DeviceCreate(BaseModel):
    serial: str


class DeviceOut(BaseModel):
    id: str
    serial: str
    last_seen_at: datetime | None
    battery_pct: float | None
    signal_quality: float | None
    electrode_drift_flagged: bool
    artefact_flagged: bool

    model_config = ConfigDict(from_attributes=True)


class PlantCreate(BaseModel):
    label: str | None = None
    device_id: str | None = None
    covered_count: int = Field(default=1, ge=1)
    row: int | None = None
    col: int | None = None


class PlantOut(BaseModel):
    id: str
    label: str | None
    device_id: str | None
    covered_count: int
    row: int | None
    col: int | None

    model_config = ConfigDict(from_attributes=True)


class PredictRequest(BaseModel):
    """Optional raw window — if omitted, a demo synthetic window is generated for the
    plant's class (round-robin over the four classes keyed by plant id), clearly flagged
    is_synthetic in the response either way. See backend/api/ml_runtime.py."""
    potential_mv: list[float] | None = None
    air_temp_c: list[float] | None = None
    humidity_pct: list[float] | None = None
    leaf_temp_c: list[float] | None = None
    fs_hz: float = 10.0


class PredictionOut(BaseModel):
    plant_id: str
    is_measured: bool
    distance_rank: int
    is_synthetic: bool
    model_version: str
    result: dict  # tier-shaped — see backend/api/tiers.py::shape_prediction


class FieldCellOut(BaseModel):
    """One cell of the farmer field map (section 4/6). ring=0 is the sentinel itself."""
    ring: int
    is_measured: bool
    is_unknown: bool  # confidence decayed below the honesty floor — section 8
    cell_count: int  # how many real plants this one visual cell represents
    result: dict  # tier-shaped, same shape as PredictionOut.result


class FieldOut(BaseModel):
    plant_id: str
    block_size: int
    is_synthetic: bool
    cells: list[FieldCellOut]


class TrendPointOut(BaseModel):
    timestamp: datetime
    days_ago: float
    result: dict  # tier-shaped


class TrendOut(BaseModel):
    plant_id: str
    window_days: float
    is_synthetic: bool
    points: list[TrendPointOut]


class SignalOut(BaseModel):
    """The lab view's waveform viewer (section 7) — raw signal + environmental channels,
    overlaid so confounds are visible, with pan (offset_minutes) and zoom (duration_minutes)."""
    plant_id: str
    is_synthetic: bool
    fs_hz: float
    downsample_stride: int
    timestamp_s: list[float]
    potential_mv: list[float]
    air_temp_c: list[float]
    humidity_pct: list[float]
    leaf_temp_c: list[float]


class FeaturesOut(BaseModel):
    """The computed feature values for the current window, in a table (section 7)."""
    plant_id: str
    is_synthetic: bool
    features: dict[str, float]


class ShapFeatureOut(BaseModel):
    feature: str
    shap_value: float
    feature_value: float


class ExplainOut(BaseModel):
    """SHAP explanation for the current prediction (section 3/7, Pro tier only)."""
    plant_id: str
    class_label: str
    top_features: list[ShapFeatureOut]


class ConfoundClassStat(BaseModel):
    class_label: str
    n_plants: int
    env_air_temp_std_c_mean: float


class ConfoundPanelOut(BaseModel):
    """Section 7's confound panel: chamber temperature against predicted class, flagging
    suspicious correlation — the compressor confound found for real in step 2's SHAP
    analysis (env_air_temp_std_c dominating the heat class). See
    ~/Desktop/PlantHealth-Decisions/06-confound-finding.md."""
    is_synthetic: bool
    chamber_type: str | None
    confound_panel_enabled: bool
    n_plants_analyzed: int
    by_class: list[ConfoundClassStat]
    flagged: bool
    flag_reason: str | None


# -------------------------------------------------------------------------------- admin (section 10)


class AdminTenantOut(BaseModel):
    id: str
    name: str
    tier: Tier
    role: Role
    suspended: bool
    created_at: datetime
    n_devices: int
    device_limit: int | None  # None = unlimited
    n_plants_covered: int
    plants_limit: int | None
    history_retention_days: int | None


class AdminDeviceOut(BaseModel):
    id: str
    tenant_id: str
    tenant_name: str
    serial: str
    last_seen_at: datetime | None
    battery_pct: float | None
    signal_quality: float | None
    electrode_drift_flagged: bool
    artefact_flagged: bool


class ArtefactFlagRequest(BaseModel):
    artefact_flagged: bool


class ModelVersionOut(BaseModel):
    """Section 10: 'Model registry: versions, training date, leave-one-plant-out accuracy
    per version, which tenants are on which version.' This demo serves exactly one model
    at a time (no multi-version rollout), so n_tenants_on_version is always every tenant —
    documented rather than fabricating a rollout history that doesn't exist."""
    version: str
    is_synthetic: bool
    trained_at: datetime | None
    window_minutes: float
    fs_hz: float
    honest_leave_one_plant_out_accuracy: float | None
    honest_leave_one_plant_out_macro_f1: float | None
    confound_ablation_accuracy_points_from_environment: float | None
    n_tenants_on_version: int


class PredictionVolumeDay(BaseModel):
    date: str
    healthy: int = 0
    drought: int = 0
    heat: int = 0
    salinity: int = 0
    total: int = 0


class AdminSummaryOut(BaseModel):
    is_synthetic: bool
    tenants: list[AdminTenantOut]
    devices: list[AdminDeviceOut]
    model_version: ModelVersionOut | None
    prediction_volume: list[PredictionVolumeDay]


# -------------------------------------------------------------------------------- alerts (section 9, stubbed delivery)


class AlertPreferenceRequest(BaseModel):
    alert_email: EmailStr | None = None
    alert_webhook_url: str | None = None


class AlertPreferenceOut(BaseModel):
    alerts_tier: str  # "none" | "email" | "email_webhook" — what this tier allows
    alert_email: str | None
    alert_webhook_url: str | None
    email_allowed: bool
    webhook_allowed: bool


class TestAlertOut(BaseModel):
    simulated: bool  # always True — no real delivery in this build, see backend/api/routers/alerts.py
    channel: str
    destination: str
    message: str


class AlertLogOut(BaseModel):
    id: str
    channel: str
    destination: str
    message: str
    simulated: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GroundTruthUploadOut(BaseModel):
    id: str
    filename: str
    row_count: int
    columns: list[str]
    preview: list[dict]
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ActuatorStartRequest(BaseModel):
    kind: Literal["irrigation", "fertiliser"]
    duration_min: int = Field(ge=1, le=120)


class ActuatorActionOut(BaseModel):
    id: str
    plant_id: str
    kind: str
    method: str | None
    duration_min: int
    started_at: datetime
    ends_at: datetime
    stopped_at: datetime | None
    running: bool
    simulated: bool
