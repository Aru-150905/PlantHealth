from .conftest import register_and_login


def test_field_endpoint_shows_decaying_confidence_across_rings(client):
    headers = register_and_login(client, "field1@example.com", "pro")
    plant_id = client.post("/plants", json={"covered_count": 300}, headers=headers).json()["id"]

    r = client.get(f"/plants/{plant_id}/field", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["is_synthetic"] is True
    assert body["cells"][0]["ring"] == 0
    assert body["cells"][0]["is_measured"] is True

    # confidence must be non-increasing as ring increases (equal within a ring, strictly
    # lower between rings) — this is the user-facing contract, checked end to end over HTTP
    by_ring: dict[int, float] = {}
    for cell in body["cells"]:
        conf = cell["result"].get("confidence_pct")
        if conf is not None:
            by_ring.setdefault(cell["ring"], conf)
    rings = sorted(by_ring)
    confidences = [by_ring[r] for r in rings]
    for a, b in zip(confidences, confidences[1:]):
        assert b <= a


def test_field_block_size_query_param_overrides_covered_count(client):
    headers = register_and_login(client, "field2@example.com", "pro")
    plant_id = client.post("/plants", json={"covered_count": 2}, headers=headers).json()["id"]

    r_small = client.get(f"/plants/{plant_id}/field", headers=headers)
    r_large = client.get(f"/plants/{plant_id}/field?block_size=3000", headers=headers)

    assert r_small.json()["block_size"] == 2
    assert r_large.json()["block_size"] == 3000
    assert len(r_large.json()["cells"]) > len(r_small.json()["cells"])


def test_field_hides_class_on_basic_tier_same_as_predict(client):
    headers = register_and_login(client, "field3@example.com", "basic")
    plant_id = client.post("/plants", json={"covered_count": 50}, headers=headers).json()["id"]
    r = client.get(f"/plants/{plant_id}/field", headers=headers)
    for cell in r.json()["cells"]:
        assert cell["result"]["class_label"] is None, "Basic tier gating must apply to field cells too, not just /predict"


def test_trend_rejects_invalid_days(client):
    headers = register_and_login(client, "trend1@example.com", "pro")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
    r = client.get(f"/plants/{plant_id}/trend?days=3", headers=headers)
    assert r.status_code == 400


def test_trend_day_view_has_24_points_week_view_has_14(client):
    headers = register_and_login(client, "trend2@example.com", "pro")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]

    r = client.get(f"/plants/{plant_id}/trend?days=1", headers=headers)
    assert len(r.json()["points"]) == 24

    r = client.get(f"/plants/{plant_id}/trend?days=7", headers=headers)
    assert len(r.json()["points"]) == 14


def test_trend_and_predict_and_field_agree_on_now(client):
    """The consistency bug found during manual testing: /predict, /trend's most recent
    point, and /field's sentinel cell must all describe the SAME 'now' reading for the same
    plant — not independently regenerated (and therefore potentially different) synthetic
    data. See ~/Desktop/PlantHealth-Decisions for the writeup of why this wasn't true
    before DEMO_HISTORY_DAYS caching was added."""
    headers = register_and_login(client, "trend3@example.com", "pro")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]

    predicted = client.post(f"/plants/{plant_id}/predict", json={}, headers=headers).json()["result"]
    trend_now = client.get(f"/plants/{plant_id}/trend?days=1", headers=headers).json()["points"][-1]["result"]
    field_now = client.get(f"/plants/{plant_id}/field", headers=headers).json()["cells"][0]["result"]

    assert predicted["class_label"] == trend_now["class_label"] == field_now["class_label"]
    assert predicted["confidence_pct"] == trend_now["confidence_pct"] == field_now["confidence_pct"]


def test_trend_points_are_chronological_oldest_to_newest(client):
    headers = register_and_login(client, "trend4@example.com", "pro")
    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers).json()["id"]
    r = client.get(f"/plants/{plant_id}/trend?days=7", headers=headers)
    days_ago = [p["days_ago"] for p in r.json()["points"]]
    assert days_ago == sorted(days_ago, reverse=True), "oldest (largest days_ago) first, 'now' (0) last"
