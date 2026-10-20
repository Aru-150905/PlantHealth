"""
Tier limits and enforcement — PlantHealth API.

Section 9 of the brief, encoded directly: "Enforce limits server-side, not just in the UI."
Every number/capability in that table lives in TIER_LIMITS below, and every endpoint that
touches a limited resource or a gated response field calls into this module rather than
re-deriving the rule locally — one place to audit against the brief's table.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from fastapi import HTTPException, status

from .models import Tier

UNLIMITED = math.inf


@dataclass(frozen=True)
class TierLimits:
    max_sentinel_devices: float  # UNLIMITED for pro
    max_plants_covered: float
    which_of_4_states: bool  # False => only stressed/not-stressed
    confidence_detail: str  # "coarse_band" | "exact_pct" | "exact_pct_plus_calibration_curve"
    diagnosis_and_remedy: bool
    diagnosis_severity_timeline: bool  # pro-only extra
    history_retention_days: float  # UNLIMITED for pro
    raw_export: str  # "none" | "csv" | "csv_api"
    shap_explanations: bool
    alerts: str  # "none" | "email" | "email_webhook"


TIER_LIMITS: dict[Tier, TierLimits] = {
    Tier.basic: TierLimits(
        max_sentinel_devices=1, max_plants_covered=100,
        which_of_4_states=False, confidence_detail="coarse_band",
        diagnosis_and_remedy=False, diagnosis_severity_timeline=False,
        history_retention_days=7, raw_export="none",
        shap_explanations=False, alerts="none",
    ),
    Tier.premium: TierLimits(
        max_sentinel_devices=10, max_plants_covered=1000,
        which_of_4_states=True, confidence_detail="exact_pct",
        diagnosis_and_remedy=True, diagnosis_severity_timeline=False,
        history_retention_days=90, raw_export="csv",
        shap_explanations=False, alerts="email",
    ),
    Tier.pro: TierLimits(
        max_sentinel_devices=UNLIMITED, max_plants_covered=UNLIMITED,
        which_of_4_states=True, confidence_detail="exact_pct_plus_calibration_curve",
        diagnosis_and_remedy=True, diagnosis_severity_timeline=True,
        history_retention_days=UNLIMITED, raw_export="csv_api",
        shap_explanations=True, alerts="email_webhook",
    ),
}

# What the next tier up would unlock, for the "explain what they'd get" upgrade prompt
# (brief: "When a Basic user hits the device limit, explain what they'd get rather than
# just blocking them.") — not auto-derived from TIER_LIMITS so the copy can be hand-tuned.
UPGRADE_PITCH: dict[Tier, str] = {
    Tier.basic: (
        "Premium gets you 10 sentinel devices (up from 1), covers up to 1,000 plants, shows "
        "exact confidence percentages instead of a coarse band, tells you WHICH of the 4 "
        "states a block is in (not just stressed/not), and adds diagnosis + remedy guidance "
        "and email alerts."
    ),
    Tier.premium: (
        "Pro removes the device and plant-count limits entirely, adds SHAP explanations for "
        "every prediction, severity + timeline on diagnoses, full calibration curves, "
        "CSV+API export, and webhook alerts."
    ),
}


def limits_for(tier: Tier) -> TierLimits:
    return TIER_LIMITS[tier]


def _limit_error(resource: str, tier: Tier, limit: float, current: int) -> HTTPException:
    pitch = UPGRADE_PITCH.get(tier, "")
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "error": f"{resource}_limit_reached",
            "message": f"Your {tier.value} plan allows {int(limit) if limit != UNLIMITED else 'unlimited'} "
                       f"{resource}; you're at {current}.",
            "tier": tier.value,
            "limit": None if limit == UNLIMITED else int(limit),
            "current": current,
            "upgrade_pitch": pitch,
        },
    )


def check_device_limit(tier: Tier, current_device_count: int) -> None:
    limit = limits_for(tier).max_sentinel_devices
    if current_device_count >= limit:
        raise _limit_error("sentinel devices", tier, limit, current_device_count)


def check_plants_covered_limit(tier: Tier, current_covered: int, adding: int) -> None:
    limit = limits_for(tier).max_plants_covered
    if current_covered + adding > limit:
        raise _limit_error("plants covered", tier, limit, current_covered)


def shape_prediction(tier: Tier, class_label: str, stressed: bool, proba: dict[str, float]) -> dict:
    """The tier-shaped view of a prediction — section 9's table, applied. This is what
    every prediction-returning endpoint sends back; nothing downstream re-implements this
    gating logic.
    """
    limits = limits_for(tier)
    confidence = max(proba.values())

    out: dict = {"stressed": stressed}

    if limits.which_of_4_states:
        out["class_label"] = class_label
    else:
        out["class_label"] = None  # Basic: stressed/not only, per section 9

    if limits.confidence_detail == "coarse_band":
        band = "fairly sure" if confidence >= 0.7 else "uncertain" if confidence >= 0.4 else "not sure yet"
        out["confidence_band"] = band
        out["confidence_pct"] = None
    else:
        out["confidence_pct"] = round(confidence * 100, 1)
        out["confidence_band"] = None
        if limits.confidence_detail == "exact_pct_plus_calibration_curve":
            out["full_probability_vector"] = {k: round(v, 4) for k, v in proba.items()}

    out["diagnosis_remedy_available"] = limits.diagnosis_and_remedy
    out["severity_timeline_available"] = limits.diagnosis_severity_timeline
    out["shap_available"] = limits.shap_explanations
    out["raw_export"] = limits.raw_export
    return out
