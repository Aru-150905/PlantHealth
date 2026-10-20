from __future__ import annotations

from datetime import datetime

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

    model_config = ConfigDict(from_attributes=True)


class RegisterRequest(BaseModel):
    tenant_name: str
    email: EmailStr
    password: str = Field(min_length=8)
    tier: Tier = Tier.basic


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
