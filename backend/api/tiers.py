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

# Section 8: "when the model is uncertain, say so instead of picking a class anyway." Below
# this confidence, every tier gets the "unknown / insufficient signal" state (shape_unknown
# below) instead of a number — illustrative threshold, not fit to any labelled real-world
# calibration data (none exists for this project — see backend/data/README.md).
UNKNOWN_CONFIDENCE_FLOOR = 0.40


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


def rescale_proba(proba: dict[str, float], new_top_confidence: float) -> dict[str, float]:
    """Rescale a probability vector so its top class's probability becomes
    `new_top_confidence`, redistributing the remainder across the other classes
    proportionally to their original ratios. Used by the sentinel field map (section 4) to
    show a neighbour cell's DECAYED confidence while keeping the same predicted class the
    sentinel actually measured — an inferred cell is still "probably drought, just less
    sure," not a different, independently-drawn prediction.
    """
    top_class = max(proba, key=proba.get)
    others = {k: v for k, v in proba.items() if k != top_class}
    remainder = max(0.0, 1.0 - new_top_confidence)
    # Hand the remainder out proportionally, but never let another class exceed the decayed
    # top class: otherwise max(proba) — what the API reports as the cell's confidence — could
    # RISE with distance and silently belong to a different class (found as an intermittent
    # failure of test_field_endpoint_shows_decaying_confidence_across_rings). Classes that
    # would overflow are capped at the top value and the excess re-shared among the rest.
    # Always feasible here: cells below UNKNOWN_CONFIDENCE_FLOOR (0.40) never get rescaled,
    # and 3 other classes x 0.40 >= the 0.60 maximum remainder.
    scaled_others: dict[str, float] = {}
    free = dict(others)
    left = remainder
    while free:
        free_sum = sum(free.values())
        if free_sum > 1e-9:
            trial = {k: v / free_sum * left for k, v in free.items()}
        else:
            trial = {k: left / len(free) for k in free}
        over = [k for k, v in trial.items() if v > new_top_confidence]
        if not over:
            scaled_others.update(trial)
            break
        for k in over:
            scaled_others[k] = new_top_confidence
            left -= new_top_confidence
            del free[k]
    return {top_class: new_top_confidence, **scaled_others}


def shape_unknown(tier: Tier, reason: str) -> dict:
    """The honesty state section 8 requires: 'when the model is uncertain, say so instead
    of picking a class anyway... build an unknown / insufficient signal state and use it.'
    Used both for a genuinely low-confidence reading and for a sentinel field-map cell
    whose distance-decayed confidence fell below the floor (backend/api/sentinel.py) —
    same principle, two sources. No tier gets a fake precise number here, Pro included:
    an unknowable extrapolation doesn't become knowable by paying more.
    """
    limits = limits_for(tier)
    return {
        "stressed": None,
        "class_label": None,
        "confidence_band": "not sure yet" if limits.confidence_detail == "coarse_band" else None,
        "confidence_pct": None,
        "unknown": True,
        "unknown_reason": reason,
        "diagnosis_remedy_available": False,
        "severity_timeline_available": False,
        "severity": None,
        "estimated_timeline": None,
        "shap_available": False,
        "raw_export": limits.raw_export,
    }


# Pro's diagnosis extra (section 9: "Yes + severity and timeline"). Timelines are general
# physiological expectations from the literature this project's physiology is grounded in
# (see backend/data/README.md), not measured from this deployment's own plants — stated
# here as guidance, same "general guidance only, not a diagnosis" framing as the remedy text
# itself (section 8).
_TIMELINE_BY_CLASS = {
    "drought": "Develops over days; expect visible improvement within 3-5 days of adequate watering.",
    "heat": "Fast-onset, often within hours; usually eases within 24-48h once temperature/ventilation improve.",
    "salinity": "Develops over days to weeks; recovery after flushing the root zone can take 1-2 weeks.",
}


def _severity_and_timeline(class_label: str, stressed: bool, confidence: float) -> tuple[str, str | None]:
    if not stressed:
        return "none", None
    severity = "severe" if confidence >= 0.85 else "moderate" if confidence >= 0.6 else "mild"
    return severity, _TIMELINE_BY_CLASS.get(class_label)


def shape_prediction(tier: Tier, class_label: str, stressed: bool, proba: dict[str, float]) -> dict:
    """The tier-shaped view of a prediction — section 9's table, applied. This is what
    every prediction-returning endpoint sends back; nothing downstream re-implements this
    gating logic.
    """
    limits = limits_for(tier)
    confidence = max(proba.values())

    out: dict = {"stressed": stressed, "unknown": False}

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
    if limits.diagnosis_severity_timeline:
        severity, timeline = _severity_and_timeline(class_label, stressed, confidence)
        out["severity"] = severity
        out["estimated_timeline"] = timeline
    else:
        out["severity"] = None
        out["estimated_timeline"] = None
    out["shap_available"] = limits.shap_explanations
    out["raw_export"] = limits.raw_export
    return out


def shape_prediction_or_unknown(tier: Tier, class_label: str, stressed: bool, proba: dict[str, float]) -> dict:
    """What every /predict-style endpoint should actually call: applies the section-8
    honesty floor before tier-shaping, so a genuinely low-confidence reading becomes
    'unknown' instead of a falsely confident class — on every tier, not just the ones that
    show a coarse band."""
    confidence = max(proba.values())
    if confidence < UNKNOWN_CONFIDENCE_FLOOR:
        return shape_unknown(tier, reason="window variance below threshold")
    return shape_prediction(tier, class_label, stressed, proba)
