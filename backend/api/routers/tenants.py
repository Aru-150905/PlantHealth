from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_tenant
from ..models import Role, Tenant
from ..schemas import (
    FarmerOnboardingRequest, LabOnboardingRequest, LanguageUpdateRequest,
    OnboardingOut, RoleUpdateRequest, TenantOut,
)
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
    """The first-run question (section 5), and 'let the user change it later in settings'.
    Switching to a role that has no onboarding profile yet leaves onboarding_completed
    False until that flow runs — the frontend reads that to decide whether to show the
    wizard."""
    tenant.role = body.role
    profile = tenant.onboarding_profile or {}
    needed_keys = {"farmer", "lab"} if body.role == Role.both else {body.role.value}
    tenant.onboarding_completed = needed_keys.issubset(profile.keys()) if body.role != Role.unset else False
    db.commit()
    db.refresh(tenant)
    return tenant


def _coverage_ratio_text(sensor_count: int, plant_count: int | None, plant_count_band: str | None) -> str:
    if plant_count:
        per_sensor = max(1, round(plant_count / max(sensor_count, 1)))
        return f"1 sensor per {per_sensor} plants"
    if plant_count_band:
        return f"{sensor_count} sensor(s) covering a {plant_count_band}-plant field"
    return f"{sensor_count} sensor(s) — add a plant count to see the coverage ratio"


@router.get("/me/onboarding", response_model=OnboardingOut)
def get_onboarding(tenant: Tenant = Depends(get_current_tenant)):
    profile = tenant.onboarding_profile or {}
    farmer = profile.get("farmer")
    lab = profile.get("lab")
    return OnboardingOut(
        role=tenant.role, onboarding_completed=tenant.onboarding_completed,
        farmer=farmer, lab=lab,
        coverage_ratio_text=_coverage_ratio_text(
            farmer["sensor_count"], farmer.get("plant_count"), farmer.get("plant_count_band")
        ) if farmer else None,
        confound_panel_enabled=(lab.get("chamber_type") == "incubator") if lab else None,
    )


@router.put("/me/onboarding/farmer", response_model=OnboardingOut)
def submit_farmer_onboarding(
    body: FarmerOnboardingRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    profile = dict(tenant.onboarding_profile or {})
    profile["farmer"] = body.model_dump()
    tenant.onboarding_profile = profile
    tenant.language = body.language
    if tenant.role in (Role.farmer, Role.both):
        needed = {"farmer", "lab"} if tenant.role == Role.both else {"farmer"}
        tenant.onboarding_completed = needed.issubset(profile.keys())
    db.commit()
    db.refresh(tenant)
    return get_onboarding(tenant)


@router.put("/me/onboarding/lab", response_model=OnboardingOut)
def submit_lab_onboarding(
    body: LabOnboardingRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    profile = dict(tenant.onboarding_profile or {})
    profile["lab"] = body.model_dump()
    tenant.onboarding_profile = profile
    if tenant.role in (Role.lab, Role.both):
        needed = {"farmer", "lab"} if tenant.role == Role.both else {"lab"}
        tenant.onboarding_completed = needed.issubset(profile.keys())
    db.commit()
    db.refresh(tenant)
    return get_onboarding(tenant)


@router.put("/me/language", response_model=TenantOut)
def set_language(body: LanguageUpdateRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    tenant.language = body.language
    db.commit()
    db.refresh(tenant)
    return tenant
