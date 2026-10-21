"""
ORM models — PlantHealth API.

No migration tool (Alembic) wired up for this build — schema changes in local dev just mean
deleting `plant_health.db` and re-running the seed script. Documented in backend/api/README.md;
fine for a local-first demo per the brief, worth adding Alembic before any real deployment.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Tier(str, enum.Enum):
    basic = "basic"
    premium = "premium"
    pro = "pro"


class Role(str, enum.Enum):
    """The section-5 fork. 'both' lets one account hold both onboarding flows (brief:
    "let one account hold both roles if they ask for it")."""
    farmer = "farmer"
    lab = "lab"
    both = "both"
    unset = "unset"  # before the first-run question has been answered


class Tenant(Base):
    """A tenant = one farm or one lab account. Tier and role live here, not on User, because
    tier limits (section 9) and the role fork (section 5) are account-level, not per-login."""
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    tier: Mapped[Tier] = mapped_column(Enum(Tier), default=Tier.basic, nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.unset, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    # device/artefact-quality flags an admin can set (section 10: "flag a device whose
    # readings look like artefact rather than plant" — tenant-level kill switch here,
    # per-device flag lives on Device)
    suspended: Mapped[bool] = mapped_column(Boolean, default=False)

    # section 5 onboarding. One JSON blob rather than two rigid tables: the brief explicitly
    # asks for an open schema ("leave the schema open for other crops") and a 'both' role
    # account needs to hold a farmer_profile AND a lab_profile simultaneously — a single
    # {"farmer": {...}, "lab": {...}} document fits that directly. Shape validated on the
    # way in by backend/api/schemas.py; see backend/api/README.md for why no migration tool
    # makes a flexible JSON column the pragmatic choice here over a schema that will keep
    # changing through steps 5-6.
    onboarding_profile: Mapped[dict] = mapped_column(JSON, default=dict)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    language: Mapped[str] = mapped_column(String, default="en")  # section 5 Q9 (farmer); settings-changeable

    # section 9's "Alerts: No / Email / Email+webhook" row. Delivery itself is stubbed — no
    # SMTP/webhook infrastructure exists in this local-first build (same spirit as "stub the
    # billing" in the brief's Do-Not list) — see backend/api/routers/alerts.py.
    alert_email: Mapped[str | None] = mapped_column(String, nullable=True)
    alert_webhook_url: Mapped[str | None] = mapped_column(String, nullable=True)

    users: Mapped[list["User"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    devices: Mapped[list["Device"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    plants: Mapped[list["Plant"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    tenant: Mapped["Tenant"] = relationship(back_populates="users")


class Device(Base):
    """A sentinel device — the one-in-a-hundred instrumented plant's hardware. Section 10's
    fleet health view reads straight off this table."""
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    serial: Mapped[str] = mapped_column(String, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    battery_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    signal_quality: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0-1
    electrode_drift_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    artefact_flagged: Mapped[bool] = mapped_column(Boolean, default=False)  # admin: looks like artefact, not plant
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    tenant: Mapped["Tenant"] = relationship(back_populates="devices")
    plants: Mapped[list["Plant"]] = relationship(back_populates="device")


class Plant(Base):
    """One sentinel-centered unit. For a lab tenant, covered_count is normally 1 (one
    instrumented plant = one row). For a farmer tenant, a Plant row represents a sentinel
    plus the neighbour block it's extrapolated to — covered_count is the block size (brief
    section 4: "let the user set the block size"), and that's what counts against the
    tier's "plants covered" limit (section 9), not the row count.
    """
    __tablename__ = "plants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    device_id: Mapped[str | None] = mapped_column(ForeignKey("devices.id"), nullable=True)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    covered_count: Mapped[int] = mapped_column(Integer, default=1)
    # field-layout fields used by the neighbour-inference map (section 4/6, built in step 5)
    row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    col: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    tenant: Mapped["Tenant"] = relationship(back_populates="plants")
    device: Mapped["Device | None"] = relationship(back_populates="plants")


class Prediction(Base):
    """One model prediction for one plant/window. proba_json holds the full calibrated
    probability vector — what the API actually returns is a TIER-SHAPED view of this row
    (backend/api/tiers.py), never the raw row verbatim to a Basic-tier caller."""
    __tablename__ = "predictions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    plant_id: Mapped[str] = mapped_column(ForeignKey("plants.id"), nullable=False)
    class_label: Mapped[str] = mapped_column(String, nullable=False)
    stressed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    proba_json: Mapped[dict] = mapped_column(JSON, nullable=False)  # {"healthy": 0.1, ...} calibrated
    confidence: Mapped[float] = mapped_column(Float, nullable=False)  # max(proba_json.values())
    is_measured: Mapped[bool] = mapped_column(Boolean, default=True)  # True=sentinel reading, False=inferred neighbour
    distance_rank: Mapped[int] = mapped_column(Integer, default=0)  # 0=sentinel itself; see backend/api/sentinel.py (step 5)
    model_version: Mapped[str] = mapped_column(String, nullable=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class GroundTruthUpload(Base):
    """A lab tenant's uploaded RWC/proline/MDA/chlorophyll assay CSV (section 7's "ground
    truth" onboarding flag, step 6 in the build order — storage only, not yet wired into
    model recalibration). Raw bytes kept in the DB rather than a file store: this is a
    local-first demo with no object storage, same reasoning as the ML artefacts under
    backend/api/README.md's no-migration-tool note."""
    __tablename__ = "ground_truth_uploads"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    columns_json: Mapped[list] = mapped_column(JSON, nullable=False)
    preview_json: Mapped[list] = mapped_column(JSON, nullable=False)  # first few rows, for display only
    raw_csv: Mapped[str] = mapped_column(String, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    tenant: Mapped["Tenant"] = relationship()


class AlertLog(Base):
    """One record of an alert that would have gone out — section 9's alerts row, logged so
    Settings can show a history rather than only a one-shot test result. Delivery itself is
    still stubbed (see routers/alerts.py); this table is the record of the stub firing."""
    __tablename__ = "alert_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    channel: Mapped[str] = mapped_column(String, nullable=False)  # "email" | "webhook"
    destination: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(String, nullable=False)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    tenant: Mapped["Tenant"] = relationship()
