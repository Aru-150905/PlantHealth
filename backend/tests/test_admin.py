"""
Admin dashboard (section 10): all tenants/usage, device fleet, model registry, prediction
volume, and device artefact-flagging. is_admin is set only by the seed script in this
build (no self-serve admin signup), so these tests promote a user to admin directly via
the DB session rather than going through an API path that doesn't exist.
"""

from .conftest import register_and_login


def _make_admin(client, email: str) -> dict:
    from api.db import SessionLocal
    from api.models import User

    headers = register_and_login(client, email, "pro")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        user.is_admin = True
        db.commit()
    finally:
        db.close()
    return headers


def test_non_admin_cannot_reach_admin_summary(client):
    headers = register_and_login(client, "notadmin@example.com")
    r = client.get("/admin/summary", headers=headers)
    assert r.status_code == 403


def test_admin_summary_lists_tenants_with_usage_against_limits(client):
    admin_headers = _make_admin(client, "admin1@example.com")
    other_headers = register_and_login(client, "tenant1@example.com", "basic")
    client.post("/devices", json={"serial": "D1"}, headers=other_headers)
    client.post("/plants", json={"covered_count": 42}, headers=other_headers)

    r = client.get("/admin/summary", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    names = {t["name"] for t in body["tenants"]}
    assert "Test Tenant" in names  # register_and_login's default tenant_name
    row = next(t for t in body["tenants"] if t["n_plants_covered"] == 42)
    assert row["tier"] == "basic"
    assert row["device_limit"] == 1
    assert row["plants_limit"] == 100
    assert row["n_devices"] == 1


def test_admin_summary_includes_model_registry_with_honest_metrics(client):
    admin_headers = _make_admin(client, "admin2@example.com")
    r = client.get("/admin/summary", headers=admin_headers)
    mv = r.json()["model_version"]
    assert mv is not None
    assert mv["is_synthetic"] is True
    assert 0.0 <= mv["honest_leave_one_plant_out_accuracy"] <= 1.0
    assert mv["n_tenants_on_version"] >= 1


def test_admin_summary_tracks_prediction_volume_by_class(client):
    admin_headers = _make_admin(client, "admin3@example.com")
    tenant_headers = register_and_login(client, "tenant2@example.com", "pro")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=tenant_headers).json()["id"]
    client.post(f"/plants/{plant_id}/predict", json={}, headers=tenant_headers)

    r = client.get("/admin/summary", headers=admin_headers)
    volume = r.json()["prediction_volume"]
    assert len(volume) >= 1
    assert sum(day["total"] for day in volume) >= 1


def test_admin_cross_tenant_isolation_does_not_apply_to_admin(client):
    """Unlike a normal tenant (test_auth.py's isolation test), an admin can see and act on
    every tenant's devices — that's the point of the dashboard."""
    admin_headers = _make_admin(client, "admin4@example.com")
    tenant_headers = register_and_login(client, "tenant3@example.com", "basic")
    device_id = client.post("/devices", json={"serial": "D-X"}, headers=tenant_headers).json()["id"]

    r = client.put(f"/admin/devices/{device_id}/flag", json={"artefact_flagged": True}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["artefact_flagged"] is True


def test_non_admin_cannot_flag_devices(client):
    headers = register_and_login(client, "tenant4@example.com", "basic")
    device_id = client.post("/devices", json={"serial": "D-Y"}, headers=headers).json()["id"]
    r = client.put(f"/admin/devices/{device_id}/flag", json={"artefact_flagged": True}, headers=headers)
    assert r.status_code == 403
