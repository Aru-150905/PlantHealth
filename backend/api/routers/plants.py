from __future__ import annotations

from sqlalchemy import func

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_tenant
from ..models import Plant, Tenant
from ..schemas import PlantCreate, PlantOut
from ..tiers import check_plants_covered_limit

router = APIRouter(prefix="/plants", tags=["plants"])


@router.get("", response_model=list[PlantOut])
def list_plants(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    return db.query(Plant).filter(Plant.tenant_id == tenant.id).all()


@router.post("", response_model=PlantOut, status_code=201)
def create_plant(body: PlantCreate, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    current_covered = db.query(func.coalesce(func.sum(Plant.covered_count), 0)).filter(
        Plant.tenant_id == tenant.id
    ).scalar()
    check_plants_covered_limit(tenant.tier, current_covered, body.covered_count)

    plant = Plant(
        tenant_id=tenant.id, device_id=body.device_id, label=body.label,
        covered_count=body.covered_count, row=body.row, col=body.col,
    )
    db.add(plant)
    db.commit()
    db.refresh(plant)
    return plant


@router.delete("/{plant_id}", status_code=204)
def delete_plant(plant_id: str, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    plant = db.query(Plant).filter(Plant.id == plant_id, Plant.tenant_id == tenant.id).first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    db.delete(plant)
    db.commit()
