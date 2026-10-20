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
