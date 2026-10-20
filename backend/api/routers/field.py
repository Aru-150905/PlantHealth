"""
Sentinel field map + trend — PlantHealth API. Section 4 (sentinel/confidence-decay) and
section 6 ("trend over the last 24 hours / 7 days — is it getting worse?").
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import sentinel
from ..db import get_db
from ..deps import get_current_tenant
from ..ml_runtime import ModelNotTrainedError, runtime
from ..models import Plant, Tenant
from ..schemas import FieldCellOut, FieldOut, TrendOut, TrendPointOut
from ..tiers import rescale_proba, shape_prediction_or_unknown, shape_unknown

router = APIRouter(prefix="/plants", tags=["field"])


def _get_plant(plant_id: str, tenant: Tenant, db: Session) -> Plant:
    plant = db.query(Plant).filter(Plant.id == plant_id, Plant.tenant_id == tenant.id).first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    return plant


@router.get("/{plant_id}/field", response_model=FieldOut)
def get_field(
    plant_id: str,
    block_size: int | None = Query(None, ge=1, description="Override the plant's covered_count — section 4: 'let the user set the block size and watch the inferred confidence change'"),
    tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    plant = _get_plant(plant_id, tenant, db)
    size = block_size if block_size is not None else max(1, plant.covered_count)

    try:
        window = runtime.demo_window_for_plant(plant_id)
        class_label, stressed, proba = runtime.predict_window(
            window["potential_mv"], window["air_temp_c"], window["humidity_pct"], window["leaf_temp_c"],
        )
    except ModelNotTrainedError as e:
        raise HTTPException(status_code=503, detail=str(e))

    cells = sentinel.build_field(base_confidence=max(proba.values()), covered_count=size)
    out_cells = []
    for cell in cells:
        if cell.is_unknown:
            reason = (
                "too far from the sentinel to estimate reliably" if cell.ring > 0
                else "window variance below threshold"
            )
            result = shape_unknown(tenant.tier, reason=reason)
        else:
            cell_proba = proba if cell.ring == 0 else rescale_proba(proba, cell.confidence)
            result = shape_prediction_or_unknown(tenant.tier, class_label, stressed, cell_proba)
        out_cells.append(FieldCellOut(
            ring=cell.ring, is_measured=cell.is_measured, is_unknown=cell.is_unknown,
            cell_count=cell.cell_count, result=result,
        ))

    return FieldOut(plant_id=plant.id, block_size=size, is_synthetic=True, cells=out_cells)


@router.get("/{plant_id}/trend", response_model=TrendOut)
def get_trend(
    plant_id: str,
    days: float = Query(1.0, description="1 (last 24h) or 7 (last 7d) — section 6"),
    tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    if days not in (1.0, 7.0):
        raise HTTPException(status_code=400, detail="days must be 1 or 7 — section 6: 'trend over the last 24 hours / 7 days'")
    plant = _get_plant(plant_id, tenant, db)

    n_points = 24 if days == 1.0 else 14  # hourly for the day view, 12h steps for the week view
    try:
        # same canonical recording /predict slices its "now" window from — see
        # ml_runtime.DEMO_HISTORY_DAYS for why that matters for day/week/predict agreeing
        df = runtime.demo_recording_for_plant(plant_id, fs_hz=10.0)
    except ModelNotTrainedError as e:
        raise HTTPException(status_code=503, detail=str(e))

    now = datetime.now(timezone.utc)
    points = []
    for i in range(n_points):
        # oldest first (left-to-right chart), newest point is "now" (offset 0)
        offset = days * (n_points - 1 - i) / max(1, n_points - 1)
        try:
            window = runtime.window_from_recording(df, end_offset_days=offset, fs_hz=10.0)
            class_label, stressed, proba = runtime.predict_window(
                window["potential_mv"], window["air_temp_c"], window["humidity_pct"], window["leaf_temp_c"],
            )
        except ModelNotTrainedError as e:
            raise HTTPException(status_code=503, detail=str(e))
        result = shape_prediction_or_unknown(tenant.tier, class_label, stressed, proba)
        points.append(TrendPointOut(timestamp=now - timedelta(days=offset), days_ago=offset, result=result))

    return TrendOut(plant_id=plant.id, window_days=days, is_synthetic=True, points=points)
