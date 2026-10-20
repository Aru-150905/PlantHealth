from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_tenant
from ..ml_runtime import ModelNotTrainedError, runtime
from ..models import Plant, Prediction, Tenant
from ..schemas import PredictionOut, PredictRequest
from ..tiers import shape_prediction_or_unknown

router = APIRouter(prefix="/plants", tags=["predict"])


@router.post("/{plant_id}/predict", response_model=PredictionOut)
def predict(
    plant_id: str, body: PredictRequest,
    tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    plant = db.query(Plant).filter(Plant.id == plant_id, Plant.tenant_id == tenant.id).first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")

    is_synthetic = True
    if body.potential_mv is not None:
        # a caller supplying real hardware-acquired arrays would set this False once real
        # device ingestion exists (not yet built — see backend/api/README.md); until then
        # every prediction path in this demo is synthetic, flagged honestly either way.
        window = body.model_dump()
    else:
        try:
            window = runtime.demo_window_for_plant(plant_id, fs_hz=body.fs_hz)
        except ModelNotTrainedError as e:
            raise HTTPException(status_code=503, detail=str(e))

    try:
        class_label, stressed, proba = runtime.predict_window(
            window["potential_mv"], window["air_temp_c"], window["humidity_pct"], window["leaf_temp_c"],
        )
    except ModelNotTrainedError as e:
        raise HTTPException(status_code=503, detail=str(e))

    record = Prediction(
        tenant_id=tenant.id, plant_id=plant.id, class_label=class_label, stressed=stressed,
        proba_json=proba, confidence=max(proba.values()), is_measured=True, distance_rank=0,
        model_version=runtime.model_version, is_synthetic=is_synthetic,
    )
    db.add(record)
    db.commit()

    shaped = shape_prediction_or_unknown(tenant.tier, class_label, stressed, proba)
    return PredictionOut(
        plant_id=plant.id, is_measured=True, distance_rank=0,
        is_synthetic=is_synthetic, model_version=runtime.model_version, result=shaped,
    )
