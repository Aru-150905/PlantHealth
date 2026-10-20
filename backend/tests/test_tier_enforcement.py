"""
Server-side tier enforcement — section 9: "Enforce limits server-side, not just in the UI."
These tests exist to prove that claim rather than take it on faith: every limit in the
section 9 table gets at least one test that actually hits it over the API, not just a call
into tiers.py's helper functions directly.
"""

from .conftest import register_and_login


def test_basic_device_limit_is_one(client):
    headers = register_and_login(client, "basic1@example.com", "basic")
    r = client.post("/devices", json={"serial": "D1"}, headers=headers)
    assert r.status_code == 201

    r = client.post("/devices", json={"serial": "D2"}, headers=headers)
    assert r.status_code == 403
    body = r.json()["detail"]
    assert body["error"] == "sentinel devices_limit_reached"
    assert body["limit"] == 1
    assert "upgrade_pitch" in body and len(body["upgrade_pitch"]) > 0


def test_premium_device_limit_is_ten(client):
    headers = register_and_login(client, "prem1@example.com", "premium")
    for i in range(10):
        r = client.post("/devices", json={"serial": f"D{i}"}, headers=headers)
        assert r.status_code == 201, f"device {i} should succeed under premium's limit of 10"

    r = client.post("/devices", json={"serial": "D11"}, headers=headers)
    assert r.status_code == 403


def test_pro_device_limit_is_unlimited(client):
    headers = register_and_login(client, "pro1@example.com", "pro")
    for i in range(25):
        r = client.post("/devices", json={"serial": f"D{i}"}, headers=headers)
        assert r.status_code == 201, f"pro tier should never hit a device limit (device {i} failed)"


def test_basic_plants_covered_limit_is_100(client):
    headers = register_and_login(client, "basic2@example.com", "basic")
    r = client.post("/plants", json={"label": "Block A", "covered_count": 100}, headers=headers)
    assert r.status_code == 201

    r = client.post("/plants", json={"label": "Block B", "covered_count": 1}, headers=headers)
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "plants covered_limit_reached"


def test_basic_prediction_hides_class_and_shap(client):
    headers = register_and_login(client, "basic3@example.com", "basic")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
    r = client.post(f"/plants/{plant_id}/predict", json={}, headers=headers)
    assert r.status_code == 200
    result = r.json()["result"]
    assert result["class_label"] is None, "Basic tier must not reveal which of the 4 states — stressed/not only"
    assert result["confidence_pct"] is None
    assert result["confidence_band"] in ("fairly sure", "uncertain", "not sure yet")
    assert result["shap_available"] is False
    assert result["diagnosis_remedy_available"] is False
    assert result["raw_export"] == "none"


def test_premium_prediction_shows_class_and_exact_confidence_but_not_shap(client):
    headers = register_and_login(client, "prem2@example.com", "premium")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
    r = client.post(f"/plants/{plant_id}/predict", json={}, headers=headers)
    result = r.json()["result"]
    assert result["class_label"] is not None
    assert result["confidence_pct"] is not None
    assert "full_probability_vector" not in result  # that's pro-only (calibration curve tier)
    assert result["shap_available"] is False
    assert result["diagnosis_remedy_available"] is True
    assert result["severity_timeline_available"] is False
    assert result["raw_export"] == "csv"


def test_pro_prediction_shows_everything(client):
    headers = register_and_login(client, "pro2@example.com", "pro")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
    r = client.post(f"/plants/{plant_id}/predict", json={}, headers=headers)
    result = r.json()["result"]
    assert result["class_label"] is not None
    assert "full_probability_vector" in result
    assert result["shap_available"] is True
    assert result["severity_timeline_available"] is True
    assert result["raw_export"] == "csv_api"


def test_prediction_result_is_never_rounded_up_to_a_nicer_band(client):
    """Section 8: 'Never round a confidence score up to look better.' Sanity check that the
    coarse band thresholds are applied as documented, not fudged upward."""
    from api.tiers import shape_prediction
    from api.models import Tier

    out = shape_prediction(Tier.basic, "drought", True, {"drought": 0.41, "healthy": 0.3, "heat": 0.1, "salinity": 0.19})
    assert out["confidence_band"] == "uncertain"  # 0.41 is below the 0.7 "fairly sure" threshold

    out = shape_prediction(Tier.basic, "drought", True, {"drought": 0.69, "healthy": 0.2, "heat": 0.05, "salinity": 0.06})
    assert out["confidence_band"] == "uncertain"  # 0.69, not 0.70 — must not round up into "fairly sure"


def test_prediction_is_flagged_synthetic(client):
    headers = register_and_login(client, "synth1@example.com", "pro")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
    r = client.post(f"/plants/{plant_id}/predict", json={}, headers=headers)
    assert r.json()["is_synthetic"] is True
