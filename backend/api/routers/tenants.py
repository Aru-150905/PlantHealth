from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_tenant
from ..models import Tenant
from ..schemas import RoleUpdateRequest, TenantOut
from ..tiers import limits_for

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/me", response_model=TenantOut)
def get_my_tenant(tenant: Tenant = Depends(get_current_tenant)):
    return tenant


@router.get("/me/tier-limits")
def get_my_tier_limits(tenant: Tenant = Depends(get_current_tenant)):
    """What the current tenant's tier actually allows — the server-side source of truth
    the frontend reads to render the upgrade path (section 9), not a hardcoded table."""
    from dataclasses import asdict
    limits = asdict(limits_for(tenant.tier))
    for k, v in limits.items():
        if v == float("inf"):
            limits[k] = None  # unlimited
    return {"tier": tenant.tier.value, "limits": limits}


@router.put("/me/role", response_model=TenantOut)
def set_role(body: RoleUpdateRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    """Section 5: 'let the user change it later in settings'."""
    tenant.role = body.role
    db.commit()
    db.refresh(tenant)
    return tenant
