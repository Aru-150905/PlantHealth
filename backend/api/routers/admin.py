"""
Admin dashboard — PlantHealth API. Section 10: all tenants and usage against limits, device
fleet health, the model registry, prediction volume/class distribution, and the ability to
flag a device whose readings look like artefact rather than plant.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import require_admin
from ..ml_runtime import runtime
from ..models import Device, Plant, Prediction, Tenant, User
from ..schemas import (
    AdminDeviceOut, AdminSummaryOut, AdminTenantOut, ArtefactFlagRequest,
    ModelVersionOut, PredictionVolumeDay,
)
from ..tiers import limits_for

router = APIRouter(prefix="/admin", tags=["admin"])


def _model_version_info() -> ModelVersionOut | None:
    metadata_path: Path = settings.ml_models_dir / "metadata.json"
    model_path: Path = settings.ml_models_dir / "xgboost_model.joblib"
    if not metadata_path.exists() or not model_path.exists():
        return None
    with open(metadata_path) as f:
        meta = json.load(f)
    # the model's own file timestamp stands in for "training date" — nothing in the
    # training pipeline writes a timestamp into metadata.json itself (see the decision log)
    trained_at = datetime.fromtimestamp(model_path.stat().st_mtime, tz=timezone.utc)
    loaded = _safe_load()
    return ModelVersionOut(
        version=runtime.model_version if loaded else "unknown",
        is_synthetic=meta.get("is_synthetic", True),
        trained_at=trained_at,
        window_minutes=meta.get("window_minutes", 0.0),
        fs_hz=meta.get("fs_hz", 0.0),
        honest_leave_one_plant_out_accuracy=meta.get("honest_leave_one_plant_out_accuracy"),
        honest_leave_one_plant_out_macro_f1=meta.get("honest_leave_one_plant_out_macro_f1"),
        confound_ablation_accuracy_points_from_environment=meta.get("confound_ablation_accuracy_points_from_environment"),
        n_tenants_on_version=-1,  # filled in by the caller, which knows the tenant count
    )


def _safe_load() -> bool:
    try:
        runtime._ensure_loaded()
        return True
    except Exception:
        return False


@router.get("/summary", response_model=AdminSummaryOut)
def get_admin_summary(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    tenants = db.query(Tenant).all()
    device_counts = dict(db.query(Device.tenant_id, func.count(Device.id)).group_by(Device.tenant_id).all())
    plant_sums = dict(
        db.query(Plant.tenant_id, func.coalesce(func.sum(Plant.covered_count), 0)).group_by(Plant.tenant_id).all()
    )

    tenant_rows = []
    for t in tenants:
        limits = limits_for(t.tier)
        tenant_rows.append(AdminTenantOut(
            id=t.id, name=t.name, tier=t.tier, role=t.role, suspended=t.suspended, created_at=t.created_at,
            n_devices=device_counts.get(t.id, 0),
            device_limit=None if limits.max_sentinel_devices == float("inf") else int(limits.max_sentinel_devices),
            n_plants_covered=plant_sums.get(t.id, 0),
            plants_limit=None if limits.max_plants_covered == float("inf") else int(limits.max_plants_covered),
            history_retention_days=None if limits.history_retention_days == float("inf") else int(limits.history_retention_days),
        ))

    tenant_name_by_id = {t.id: t.name for t in tenants}
    devices = db.query(Device).all()
    device_rows = [
        AdminDeviceOut(
            id=d.id, tenant_id=d.tenant_id, tenant_name=tenant_name_by_id.get(d.tenant_id, "?"),
            serial=d.serial, last_seen_at=d.last_seen_at, battery_pct=d.battery_pct,
            signal_quality=d.signal_quality, electrode_drift_flagged=d.electrode_drift_flagged,
            artefact_flagged=d.artefact_flagged,
        )
        for d in devices
    ]

    model_version = _model_version_info()
    if model_version is not None:
        model_version.n_tenants_on_version = len(tenants)  # single shared model — see ModelVersionOut docstring

    predictions = db.query(Prediction.created_at, Prediction.class_label).all()
    by_date: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for created_at, class_label in predictions:
        day = created_at.strftime("%Y-%m-%d")
        by_date[day][class_label] += 1
        by_date[day]["total"] += 1
    volume = [
        PredictionVolumeDay(date=day, total=counts["total"], **{
            k: v for k, v in counts.items() if k != "total"
        })
        for day, counts in sorted(by_date.items())
    ]

    return AdminSummaryOut(
        is_synthetic=True, tenants=tenant_rows, devices=device_rows,
        model_version=model_version, prediction_volume=volume,
    )


@router.put("/devices/{device_id}/flag", response_model=AdminDeviceOut)
def flag_device(
    device_id: str, body: ArtefactFlagRequest,
    _admin: User = Depends(require_admin), db: Session = Depends(get_db),
):
    """Section 10: 'ability to flag a device whose readings look like artefact rather than
    plant.' Admin-only, cross-tenant (an admin can flag any tenant's device)."""
    device = db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    device.artefact_flagged = body.artefact_flagged
    db.commit()
    db.refresh(device)
    tenant = db.get(Tenant, device.tenant_id)
    return AdminDeviceOut(
        id=device.id, tenant_id=device.tenant_id, tenant_name=tenant.name if tenant else "?",
        serial=device.serial, last_seen_at=device.last_seen_at, battery_pct=device.battery_pct,
        signal_quality=device.signal_quality, electrode_drift_flagged=device.electrode_drift_flagged,
        artefact_flagged=device.artefact_flagged,
    )
