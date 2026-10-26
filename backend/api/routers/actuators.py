"""
Irrigation / fertiliser controls — PlantHealth API.

SIMULATED. This project's hardware only *listens* to the leaf (electrodes -> INA333 ->
ADS1256); there is no valve, pump or relay to switch. What IS real: the farmer's explicit,
confirmed request is validated, stored and shown back as history with a running/stopped
state, so the UI flow is complete and honest. A real deployment replaces
_dispatch_to_hardware() with a call to an actual controller (e.g. an ESP32 + relay board, a
commercial smart irrigation controller, or a LoRa/GSM relay for fields without Wi-Fi)
without touching the validation or history logic around it — same shape as
routers/alerts.py's stubbed delivery.

Rules (spec docs/superpowers/specs/2026-10-26-farmer-friendly-3d-redesign-design.md):
- nothing here is ever triggered automatically — only by these endpoints, which the UI calls
  after an explicit tap + confirmation;
- irrigation follows the farm's watering method, and a rain-fed farm has nothing to switch on;
- one run of each kind at a time per plant.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_tenant
from ..models import ActuatorAction, Plant, Tenant
from ..schemas import ActuatorActionOut, ActuatorStartRequest

router = APIRouter(prefix="/plants", tags=["actuators"])


def _utc(dt: datetime | None) -> datetime | None:
    # SQLite hands timezone-aware columns back naive; everything stored here is UTC
    if dt is None or dt.tzinfo is not None:
        return dt
    return dt.replace(tzinfo=timezone.utc)


def _is_running(action: ActuatorAction, now: datetime) -> bool:
    return action.stopped_at is None and now < _utc(action.ends_at)


def _out(action: ActuatorAction, now: datetime) -> ActuatorActionOut:
    return ActuatorActionOut(
        id=action.id, plant_id=action.plant_id, kind=action.kind, method=action.method,
        duration_min=action.duration_min, started_at=_utc(action.started_at),
        ends_at=_utc(action.ends_at), stopped_at=_utc(action.stopped_at),
        running=_is_running(action, now), simulated=action.simulated,
    )


def _get_plant(plant_id: str, tenant: Tenant, db: Session) -> Plant:
    plant = db.query(Plant).filter(Plant.id == plant_id, Plant.tenant_id == tenant.id).first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    return plant


def _dispatch_to_hardware(action: ActuatorAction) -> bool:
    """The seam for a real controller. Returns whether the action was simulated."""
    return True


@router.post("/{plant_id}/actions", response_model=ActuatorActionOut, status_code=201)
def start_action(
    plant_id: str, body: ActuatorStartRequest,
    tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    _get_plant(plant_id, tenant, db)
    now = datetime.now(timezone.utc)

    method = None
    if body.kind == "irrigation":
        method = (tenant.onboarding_profile or {}).get("farmer", {}).get("watering_method") or "drip"
        if method == "rain_fed":
            raise HTTPException(status_code=400, detail={
                "error": "no_irrigation_for_rain_fed",
                "message": "This farm is rain-fed — there's no irrigation to switch on.",
            })

    active = (
        db.query(ActuatorAction)
        .filter(ActuatorAction.plant_id == plant_id, ActuatorAction.kind == body.kind,
                ActuatorAction.stopped_at.is_(None))
        .all()
    )
    if any(_is_running(a, now) for a in active):
        raise HTTPException(status_code=409, detail={
            "error": "already_running",
            "message": f"A {body.kind} run is already going for this block — stop it first.",
        })

    action = ActuatorAction(
        tenant_id=tenant.id, plant_id=plant_id, kind=body.kind, method=method,
        duration_min=body.duration_min, started_at=now,
        ends_at=now + timedelta(minutes=body.duration_min),
    )
    action.simulated = _dispatch_to_hardware(action)
    db.add(action)
    db.commit()
    db.refresh(action)
    return _out(action, now)


@router.post("/{plant_id}/actions/{action_id}/stop", response_model=ActuatorActionOut)
def stop_action(
    plant_id: str, action_id: str,
    tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    _get_plant(plant_id, tenant, db)
    action = db.query(ActuatorAction).filter(
        ActuatorAction.id == action_id, ActuatorAction.plant_id == plant_id,
        ActuatorAction.tenant_id == tenant.id,
    ).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    now = datetime.now(timezone.utc)
    if _is_running(action, now):
        action.stopped_at = now
        db.commit()
        db.refresh(action)
    return _out(action, now)


@router.get("/{plant_id}/actions", response_model=list[ActuatorActionOut])
def list_actions(plant_id: str, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    _get_plant(plant_id, tenant, db)
    now = datetime.now(timezone.utc)
    rows = (
        db.query(ActuatorAction)
        .filter(ActuatorAction.plant_id == plant_id, ActuatorAction.tenant_id == tenant.id)
        .order_by(ActuatorAction.started_at.desc())
        .limit(50)
        .all()
    )
    return [_out(a, now) for a in rows]
