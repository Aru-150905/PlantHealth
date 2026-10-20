from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_tenant
from ..ml_runtime import ModelNotTrainedError, runtime
from ..models import Plant, Role, Tenant
from ..schemas import (
    ConfoundClassStat, ConfoundPanelOut, FarmerOnboardingRequest, LabOnboardingRequest,
    LanguageUpdateRequest, OnboardingOut, RoleUpdateRequest, TenantOut,
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


# confound suspicion threshold: flag when the spread between the highest- and lowest-
# variability class means exceeds this fraction of their average. Illustrative, not fit to
# any real incubator's measured compressor behaviour — same honesty footnote as
# backend/data/synthetic.py's own confound parameters.
_CONFOUND_SUSPICION_RATIO = 0.30


@router.get("/me/confound-panel", response_model=ConfoundPanelOut)
def get_confound_panel(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    """Section 7's confound panel: chamber temperature against predicted class, flagging
    suspicious correlation. This is the live version of the finding from step 2's SHAP
    analysis (env_air_temp_std_c dominating the heat class) — see
    ~/Desktop/PlantHealth-Decisions/06-confound-finding.md — computed fresh per tenant
    rather than hardcoded to that one finding, so it'll flag whichever class (if any)
    actually looks suspicious for THIS tenant's plants.
    """
    profile = tenant.onboarding_profile or {}
    lab_profile = profile.get("lab")
    chamber_type = lab_profile.get("chamber_type") if lab_profile else None
    enabled = chamber_type == "incubator"

    plants = db.query(Plant).filter(Plant.tenant_id == tenant.id).all()
    by_class: dict[str, list[float]] = {}
    try:
        for plant in plants:
            window = runtime.demo_window_for_plant(plant.id)
            class_label, _, _ = runtime.predict_window(
                window["potential_mv"], window["air_temp_c"], window["humidity_pct"], window["leaf_temp_c"],
            )
            temp_std = float(np.std(window["air_temp_c"]))
            by_class.setdefault(class_label, []).append(temp_std)
    except ModelNotTrainedError as e:
        raise HTTPException(status_code=503, detail=str(e))

    stats = [
        ConfoundClassStat(class_label=k, n_plants=len(v), env_air_temp_std_c_mean=round(sum(v) / len(v), 4))
        for k, v in sorted(by_class.items())
    ]

    flagged, reason = False, None
    if len(stats) >= 2:
        hi = max(stats, key=lambda s: s.env_air_temp_std_c_mean)
        lo = min(stats, key=lambda s: s.env_air_temp_std_c_mean)
        avg = (hi.env_air_temp_std_c_mean + lo.env_air_temp_std_c_mean) / 2
        spread = (hi.env_air_temp_std_c_mean - lo.env_air_temp_std_c_mean) / avg if avg > 1e-9 else 0
        if spread > _CONFOUND_SUSPICION_RATIO:
            flagged = True
            reason = (
                f"'{hi.class_label}' plants show {spread * 100:.0f}% more chamber-temperature "
                f"variability than '{lo.class_label}' plants. If that arm's setpoint runs "
                f"furthest from room temperature, the compressor may be cycling harder — the "
                f"model could be reading the chamber, not the plant. See backend/data/README.md."
            )
    elif not plants:
        reason = "No plants yet — add plants across more than one treatment arm to check this."
    elif len(stats) < 2:
        reason = "Only one predicted class present so far — need plants in more than one class to compare."

    return ConfoundPanelOut(
        is_synthetic=True, chamber_type=chamber_type, confound_panel_enabled=enabled,
        n_plants_analyzed=len(plants), by_class=stats, flagged=flagged, flag_reason=reason,
    )


@router.get("/me/calibration-curve.png")
def get_calibration_curve(tenant: Tenant = Depends(get_current_tenant)):
    """Section 9: Pro's confidence-score row is 'Exact % + calibration curve' — a MODEL
    property (a reliability diagram over many held-out predictions), not something any
    single prediction response can carry. Serves the actual reliability curve
    backend/ml/train.py generated from the leave-one-plant-out out-of-fold predictions
    (backend/ml/reports/calibration_curve.png), not a stand-in. 403 below Pro, same
    upgrade_pitch shape as every other tier-gated endpoint in this API."""
    if limits_for(tenant.tier).confidence_detail != "exact_pct_plus_calibration_curve":
        raise HTTPException(status_code=403, detail={
            "error": "calibration_curve_not_available",
            "message": f"The calibration curve isn't included in the {tenant.tier.value} plan.",
            "upgrade_pitch": "Pro adds the full calibration curve, SHAP explanations, and unlimited devices/plants.",
        })
    from fastapi.responses import FileResponse

    from ..config import settings
    path = settings.ml_models_dir.parent / "reports" / "calibration_curve.png"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Calibration curve not generated yet — run backend/ml/train.py.")
    return FileResponse(path, media_type="image/png")
