"""
Lab view endpoints — PlantHealth API. Section 7: live waveform + frequency view, computed
feature values per window, SHAP explanation, raw CSV export, and the confound panel.
"""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_tenant
from ..ml_runtime import ModelNotTrainedError, runtime
from ..models import Plant, Tenant
from ..schemas import ExplainOut, FeaturesOut, SignalOut
from ..tiers import limits_for

router = APIRouter(prefix="/plants", tags=["lab"])


def _get_plant(plant_id: str, tenant: Tenant, db: Session) -> Plant:
    plant = db.query(Plant).filter(Plant.id == plant_id, Plant.tenant_id == tenant.id).first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    return plant


@router.get("/{plant_id}/signal", response_model=SignalOut)
def get_signal(
    plant_id: str,
    duration_minutes: float = Query(5.0, gt=0, le=10080, description="'zoom' — how much time the window spans"),
    offset_minutes: float = Query(0.0, ge=0, description="'pan' — how far back the window's end sits from now"),
    tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    plant = _get_plant(plant_id, tenant, db)
    try:
        signal = runtime.raw_signal_for_plant(plant.id, duration_minutes, offset_minutes)
    except ModelNotTrainedError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return SignalOut(plant_id=plant.id, is_synthetic=True, **signal)


@router.get("/{plant_id}/features", response_model=FeaturesOut)
def get_features(plant_id: str, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    plant = _get_plant(plant_id, tenant, db)
    try:
        window = runtime.demo_window_for_plant(plant.id)
        features = runtime.features_dict_for_window(
            window["potential_mv"], window["air_temp_c"], window["humidity_pct"], window["leaf_temp_c"],
        )
    except ModelNotTrainedError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return FeaturesOut(plant_id=plant.id, is_synthetic=True, features=features)


@router.get("/{plant_id}/explain", response_model=ExplainOut)
def get_explain(plant_id: str, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    if not limits_for(tenant.tier).shap_explanations:
        raise HTTPException(status_code=403, detail={
            "error": "shap_not_available",
            "message": f"SHAP explanations aren't included in the {tenant.tier.value} plan.",
            "upgrade_pitch": "Pro adds SHAP explanations for every prediction, full calibration curves, and unlimited devices/plants.",
        })
    plant = _get_plant(plant_id, tenant, db)
    try:
        window = runtime.demo_window_for_plant(plant.id)
        class_label, _, _ = runtime.predict_window(
            window["potential_mv"], window["air_temp_c"], window["humidity_pct"], window["leaf_temp_c"],
        )
        top_features = runtime.explain_window(
            window["potential_mv"], window["air_temp_c"], window["humidity_pct"], window["leaf_temp_c"],
        )
    except ModelNotTrainedError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return ExplainOut(plant_id=plant.id, class_label=class_label, top_features=top_features)


@router.get("/{plant_id}/export.csv")
def export_csv(
    plant_id: str,
    duration_minutes: float = Query(30.0, gt=0, le=10080),
    tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    if limits_for(tenant.tier).raw_export == "none":
        raise HTTPException(status_code=403, detail={
            "error": "export_not_available",
            "message": f"Raw data export isn't included in the {tenant.tier.value} plan.",
            "upgrade_pitch": "Premium adds CSV export; Pro adds CSV + API access.",
        })
    plant = _get_plant(plant_id, tenant, db)
    try:
        signal = runtime.raw_signal_for_plant(plant.id, duration_minutes, offset_minutes=0.0, max_points=100_000)
    except ModelNotTrainedError as e:
        raise HTTPException(status_code=503, detail=str(e))

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["is_synthetic", "timestamp_s", "potential_mv", "air_temp_c", "humidity_pct", "leaf_temp_c"])
    for i in range(len(signal["timestamp_s"])):
        writer.writerow([
            True, signal["timestamp_s"][i], signal["potential_mv"][i],
            signal["air_temp_c"][i], signal["humidity_pct"][i], signal["leaf_temp_c"][i],
        ])
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{plant.id}_synthetic.csv"'},
    )

