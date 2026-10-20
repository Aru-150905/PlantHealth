"""
Step 8: tier gating end to end. These tests target the two gaps a systematic audit against
section 9's table actually found (Pro's calibration curve was indistinguishable from its
probability vector; Pro's 'severity and timeline' diagnosis extra didn't exist anywhere) and
the stubbed alerts row, rather than re-testing gates already covered in
test_tier_enforcement.py / test_lab_view.py.
"""

from .conftest import register_and_login


def test_calibration_curve_is_pro_only_and_is_a_real_image(client):
    headers = register_and_login(client, "cal1@example.com", "pro")
    r = client.get("/tenants/me/calibration-curve.png", headers=headers)
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert len(r.content) > 1000  # a real PNG, not an empty/placeholder response


def test_calibration_curve_blocked_below_pro(client):
    for tier in ("basic", "premium"):
        headers = register_and_login(client, f"cal_{tier}@example.com", tier)
        r = client.get("/tenants/me/calibration-curve.png", headers=headers)
        assert r.status_code == 403, f"{tier} should not get the calibration curve"
        assert "upgrade_pitch" in r.json()["detail"]


def test_severity_and_timeline_only_on_pro_and_only_when_stressed(client):
    # Basic/Premium never get severity/timeline, regardless of the actual prediction
    for tier in ("basic", "premium"):
        headers = register_and_login(client, f"sev_{tier}@example.com", tier)
        plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
        result = client.post(f"/plants/{plant_id}/predict", json={}, headers=headers).json()["result"]
        assert result["severity"] is None
        assert result["estimated_timeline"] is None
        assert result["severity_timeline_available"] is False

    # Pro gets it, and a healthy (not stressed) reading gets severity="none", not a real one
    headers = register_and_login(client, "sev_pro@example.com", "pro")
    found_stressed = False
    for i in range(8):
        plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
        result = client.post(f"/plants/{plant_id}/predict", json={}, headers=headers).json()["result"]
        assert result["severity_timeline_available"] is True
        if result["stressed"]:
            assert result["severity"] in ("mild", "moderate", "severe")
            assert result["estimated_timeline"] is not None
            found_stressed = True
        else:
            assert result["severity"] == "none"
            assert result["estimated_timeline"] is None
    assert found_stressed, "expected at least one stressed demo plant across 8 tries"


def test_alerts_gated_by_tier(client):
    headers = register_and_login(client, "alert_basic@example.com", "basic")
    r = client.get("/tenants/me/alerts", headers=headers)
    assert r.json()["alerts_tier"] == "none"
    assert r.json()["email_allowed"] is False

    r = client.put("/tenants/me/alerts", json={"alert_email": "x@example.com"}, headers=headers)
    assert r.status_code == 403

    headers = register_and_login(client, "alert_premium@example.com", "premium")
    r = client.put("/tenants/me/alerts", json={"alert_email": "x@example.com"}, headers=headers)
    assert r.status_code == 200
    r = client.put("/tenants/me/alerts", json={"alert_webhook_url": "https://example.com/hook"}, headers=headers)
    assert r.status_code == 403, "premium gets email only, not webhook"

    headers = register_and_login(client, "alert_pro@example.com", "pro")
    r = client.put("/tenants/me/alerts", json={"alert_webhook_url": "https://example.com/hook"}, headers=headers)
    assert r.status_code == 200


def test_alert_delivery_is_honestly_simulated_not_real(client):
    """Section 8's honesty principle applied to alerts: the test-alert response must say
    plainly that nothing was actually sent, not imply real delivery happened."""
    headers = register_and_login(client, "alert_test@example.com", "premium")
    client.put("/tenants/me/alerts", json={"alert_email": "x@example.com"}, headers=headers)
    r = client.post("/tenants/me/alerts/test", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["simulated"] is True
    assert "not actually sent" in body["message"].lower() or "simulated" in body["message"].lower()


def test_demo_banner_text_available_from_every_data_view(client):
    """Section 8: the demo-data banner must be persistent, 'not hidden in a tooltip.' This
    can't test the frontend DOM from here, but it can assert the one thing every data-bearing
    response actually carries: is_synthetic=True, which is what the frontend banner is
    conditioned on — see FarmerHome.tsx/LabHome.tsx/AdminDashboard.tsx, all of which render
    the banner unconditionally today (not even gated on this flag), but the flag itself must
    never silently go missing or false for synthetic data."""
    headers = register_and_login(client, "banner1@example.com", "pro")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
    assert client.post(f"/plants/{plant_id}/predict", json={}, headers=headers).json()["is_synthetic"] is True
    assert client.get(f"/plants/{plant_id}/field", headers=headers).json()["is_synthetic"] is True
    assert client.get(f"/plants/{plant_id}/trend?days=1", headers=headers).json()["is_synthetic"] is True
    assert client.get(f"/plants/{plant_id}/signal", headers=headers).json()["is_synthetic"] is True
    assert client.get(f"/plants/{plant_id}/features", headers=headers).json()["is_synthetic"] is True
    assert client.get("/tenants/me/confound-panel", headers=headers).json()["is_synthetic"] is True
    # admin's own is_synthetic flag is covered by test_admin.py; not re-tested here since
    # it needs the is_admin promotion helper that lives in that file
