from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_tenant
from ..models import Device, Tenant
from ..schemas import DeviceCreate, DeviceOut
from ..tiers import check_device_limit

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("", response_model=list[DeviceOut])
def list_devices(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    return db.query(Device).filter(Device.tenant_id == tenant.id).all()


@router.post("", response_model=DeviceOut, status_code=201)
def create_device(body: DeviceCreate, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    current_count = db.query(Device).filter(Device.tenant_id == tenant.id).count()
    check_device_limit(tenant.tier, current_count)  # 403 with upgrade pitch if at the limit

    device = Device(tenant_id=tenant.id, serial=body.serial)
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=204)
def delete_device(device_id: str, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    device = db.query(Device).filter(Device.id == device_id, Device.tenant_id == tenant.id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(device)
    db.commit()
