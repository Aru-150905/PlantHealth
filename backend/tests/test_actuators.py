from .conftest import register_and_login


def _farmer_with_plant(client, email, watering_method="drip"):
    headers = register_and_login(client, email)
    client.put("/tenants/me/role", json={"role": "farmer"}, headers=headers)
    client.put("/tenants/me/onboarding/farmer", json={"watering_method": watering_method}, headers=headers)
    plant_id = client.post("/plants", json={"covered_count": 10}, headers=headers).json()["id"]
    return headers, plant_id


def test_start_irrigation_records_simulated_action(client):
    headers, plant_id = _farmer_with_plant(client, "act1@example.com", "drip")
    r = client.post(f"/plants/{plant_id}/actions", json={"kind": "irrigation", "duration_min": 20}, headers=headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["simulated"] is True
    assert body["running"] is True
    assert body["kind"] == "irrigation"
    assert body["method"] == "drip"
    assert body["duration_min"] == 20
    assert body["stopped_at"] is None


def test_stop_marks_not_running(client):
    headers, plant_id = _farmer_with_plant(client, "act2@example.com")
    action_id = client.post(f"/plants/{plant_id}/actions", json={"kind": "irrigation", "duration_min": 10}, headers=headers).json()["id"]
    r = client.post(f"/plants/{plant_id}/actions/{action_id}/stop", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["running"] is False
    assert r.json()["stopped_at"] is not None


def test_list_newest_first(client):
    headers, plant_id = _farmer_with_plant(client, "act3@example.com")
    first = client.post(f"/plants/{plant_id}/actions", json={"kind": "irrigation", "duration_min": 10}, headers=headers).json()["id"]
    second = client.post(f"/plants/{plant_id}/actions", json={"kind": "fertiliser", "duration_min": 5}, headers=headers).json()["id"]
    ids = [a["id"] for a in client.get(f"/plants/{plant_id}/actions", headers=headers).json()]
    assert ids == [second, first]


def test_second_concurrent_same_kind_is_409(client):
    headers, plant_id = _farmer_with_plant(client, "act4@example.com")
    assert client.post(f"/plants/{plant_id}/actions", json={"kind": "irrigation", "duration_min": 10}, headers=headers).status_code == 201
    r = client.post(f"/plants/{plant_id}/actions", json={"kind": "irrigation", "duration_min": 10}, headers=headers)
    assert r.status_code == 409


def test_after_stop_same_kind_can_start_again(client):
    headers, plant_id = _farmer_with_plant(client, "act4b@example.com")
    action_id = client.post(f"/plants/{plant_id}/actions", json={"kind": "irrigation", "duration_min": 10}, headers=headers).json()["id"]
    client.post(f"/plants/{plant_id}/actions/{action_id}/stop", headers=headers)
    r = client.post(f"/plants/{plant_id}/actions", json={"kind": "irrigation", "duration_min": 10}, headers=headers)
    assert r.status_code == 201


def test_rain_fed_irrigation_is_400(client):
    headers, plant_id = _farmer_with_plant(client, "act5@example.com", "rain_fed")
    r = client.post(f"/plants/{plant_id}/actions", json={"kind": "irrigation", "duration_min": 10}, headers=headers)
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "no_irrigation_for_rain_fed"


def test_fertiliser_allowed_on_rain_fed(client):
    headers, plant_id = _farmer_with_plant(client, "act6@example.com", "rain_fed")
    r = client.post(f"/plants/{plant_id}/actions", json={"kind": "fertiliser", "duration_min": 10}, headers=headers)
    assert r.status_code == 201
    assert r.json()["method"] is None


def test_other_tenant_cannot_see_or_stop(client):
    headers, plant_id = _farmer_with_plant(client, "act7@example.com")
    action_id = client.post(f"/plants/{plant_id}/actions", json={"kind": "irrigation", "duration_min": 10}, headers=headers).json()["id"]
    other = register_and_login(client, "intruder@example.com")
    assert client.get(f"/plants/{plant_id}/actions", headers=other).status_code == 404
    assert client.post(f"/plants/{plant_id}/actions/{action_id}/stop", headers=other).status_code == 404
    assert client.post(f"/plants/{plant_id}/actions", json={"kind": "fertiliser", "duration_min": 5}, headers=other).status_code == 404


def test_duration_out_of_range_422(client):
    headers, plant_id = _farmer_with_plant(client, "act8@example.com")
    for bad in (0, 121):
        r = client.post(f"/plants/{plant_id}/actions", json={"kind": "irrigation", "duration_min": bad}, headers=headers)
        assert r.status_code == 422


def test_unknown_kind_422(client):
    headers, plant_id = _farmer_with_plant(client, "act9@example.com")
    r = client.post(f"/plants/{plant_id}/actions", json={"kind": "pesticide", "duration_min": 10}, headers=headers)
    assert r.status_code == 422
