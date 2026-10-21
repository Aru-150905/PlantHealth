"""
Alerts — PlantHealth API. Section 9's "Alerts: No / Email / Email+webhook" row.

Delivery is stubbed: this is a local-first build with no SMTP or webhook-dispatch
infrastructure (the same reasoning the brief applies to billing — "Stub the billing" —
applies here too, for the same reason: there's nothing real to connect it to in this
environment). What IS real: tier-gated storage of where an alert would go, and a test
endpoint that returns exactly what would have been sent rather than silently doing nothing.
A real deployment would swap the stub in send_test_alert() for an actual email/webhook call
without touching the gating logic around it.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_tenant
from ..models import AlertLog, Tenant
from ..schemas import AlertLogOut, AlertPreferenceOut, AlertPreferenceRequest, TestAlertOut
from ..tiers import limits_for

router = APIRouter(prefix="/tenants/me/alerts", tags=["alerts"])


def _out(tenant: Tenant) -> AlertPreferenceOut:
    tier_alerts = limits_for(tenant.tier).alerts
    return AlertPreferenceOut(
        alerts_tier=tier_alerts, alert_email=tenant.alert_email, alert_webhook_url=tenant.alert_webhook_url,
        email_allowed=tier_alerts in ("email", "email_webhook"),
        webhook_allowed=tier_alerts == "email_webhook",
    )


@router.get("", response_model=AlertPreferenceOut)
def get_alert_preference(tenant: Tenant = Depends(get_current_tenant)):
    return _out(tenant)


@router.put("", response_model=AlertPreferenceOut)
def set_alert_preference(
    body: AlertPreferenceRequest, tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    limits = limits_for(tenant.tier)
    if body.alert_email and limits.alerts == "none":
        raise HTTPException(status_code=403, detail={
            "error": "alerts_not_available",
            "message": f"Alerts aren't included in the {tenant.tier.value} plan.",
            "upgrade_pitch": "Premium adds email alerts; Pro adds email + webhook alerts.",
        })
    if body.alert_webhook_url and limits.alerts != "email_webhook":
        raise HTTPException(status_code=403, detail={
            "error": "webhook_alerts_not_available",
            "message": f"Webhook alerts aren't included in the {tenant.tier.value} plan.",
            "upgrade_pitch": "Pro adds webhook alerts alongside email.",
        })
    tenant.alert_email = body.alert_email
    tenant.alert_webhook_url = body.alert_webhook_url
    db.commit()
    db.refresh(tenant)
    return _out(tenant)


@router.post("/test", response_model=TestAlertOut)
def send_test_alert(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    limits = limits_for(tenant.tier)
    if limits.alerts == "none":
        raise HTTPException(status_code=403, detail={
            "error": "alerts_not_available",
            "message": f"Alerts aren't included in the {tenant.tier.value} plan.",
            "upgrade_pitch": "Premium adds email alerts; Pro adds email + webhook alerts.",
        })
    destination = tenant.alert_webhook_url or tenant.alert_email
    if not destination:
        raise HTTPException(status_code=400, detail="Set an alert email or webhook URL first.")
    channel = "webhook" if destination == tenant.alert_webhook_url else "email"
    message = (
        f"[SIMULATED — not actually sent] PlantHealth alert for {tenant.name}: "
        f"a block looks stressed. This is a demo build with no real email/webhook "
        f"delivery wired up — see backend/api/routers/alerts.py."
    )
    db.add(AlertLog(tenant_id=tenant.id, channel=channel, destination=destination, message=message, simulated=True))
    db.commit()
    return TestAlertOut(simulated=True, channel=channel, destination=destination, message=message)


@router.get("/history", response_model=list[AlertLogOut])
def alert_history(tenant: Tenant = Depends(get_current_tenant), db: Session = Depends(get_db)):
    logs = (
        db.query(AlertLog)
        .filter(AlertLog.tenant_id == tenant.id)
        .order_by(AlertLog.created_at.desc())
        .limit(50)
        .all()
    )
    return logs
