"""
Section 7 (lab view) endpoints: signal/features/explain/export and the confound panel.
Only the explain/export tier gates and the confound-panel logic get dedicated tests here —
signal/features are exercised via the smoke tests above and don't have tier-gating logic of
their own to verify.
"""

from .conftest import register_and_login


def test_explain_requires_pro_tier(client):
    headers = register_and_login(client, "lab1@example.com", "premium")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
    r = client.get(f"/plants/{plant_id}/explain", headers=headers)
    assert r.status_code == 403
    assert "upgrade_pitch" in r.json()["detail"]


def test_explain_works_on_pro_tier(client):
    headers = register_and_login(client, "lab2@example.com", "pro")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
    r = client.get(f"/plants/{plant_id}/explain", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["class_label"] in ("healthy", "drought", "heat", "salinity")
    assert len(body["top_features"]) == 5
    for f in body["top_features"]:
        assert "feature" in f and "shap_value" in f


def test_export_csv_requires_premium_or_above(client):
    headers = register_and_login(client, "lab3@example.com", "basic")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
    r = client.get(f"/plants/{plant_id}/export.csv", headers=headers)
    assert r.status_code == 403


def test_export_csv_works_on_premium(client):
    headers = register_and_login(client, "lab4@example.com", "premium")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
    r = client.get(f"/plants/{plant_id}/export.csv?duration_minutes=1", headers=headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0] == "is_synthetic,timestamp_s,potential_mv,air_temp_c,humidity_pct,leaf_temp_c"
    assert len(lines) > 1


def test_confound_panel_disabled_outside_incubator(client):
    headers = register_and_login(client, "lab5@example.com", "pro")
    client.put("/tenants/me/role", json={"role": "lab"}, headers=headers)
    client.put("/tenants/me/onboarding/lab", json={"chamber_type": "greenhouse"}, headers=headers)
    r = client.get("/tenants/me/confound-panel", headers=headers)
    assert r.status_code == 200
    assert r.json()["confound_panel_enabled"] is False


def test_confound_panel_with_no_plants_reports_that_honestly(client):
    headers = register_and_login(client, "lab6@example.com", "pro")
    client.put("/tenants/me/role", json={"role": "lab"}, headers=headers)
    client.put("/tenants/me/onboarding/lab", json={"chamber_type": "incubator"}, headers=headers)
    r = client.get("/tenants/me/confound-panel", headers=headers)
    body = r.json()
    assert body["n_plants_analyzed"] == 0
    assert body["flagged"] is False
    assert "no plants" in body["flag_reason"].lower()


def test_confound_panel_flags_real_temperature_spread(client):
    """The live version of the step-2 finding: with enough plants spread across classes,
    the panel should detect and flag the actual elevated chamber-temperature variability on
    the class whose setpoint deviates most from room temperature (heat, by construction of
    backend/data/synthetic.py's compressor confound)."""
    headers = register_and_login(client, "lab7@example.com", "pro")
    client.put("/tenants/me/role", json={"role": "lab"}, headers=headers)
    client.put("/tenants/me/onboarding/lab", json={"chamber_type": "incubator"}, headers=headers)
    for i in range(12):
        client.post("/plants", json={"label": f"Rep {i}", "covered_count": 1}, headers=headers)

    r = client.get("/tenants/me/confound-panel", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["n_plants_analyzed"] == 12
    assert len(body["by_class"]) >= 2
    assert body["flagged"] is True
    assert body["flag_reason"] is not None
