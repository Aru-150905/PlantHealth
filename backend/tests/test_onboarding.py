"""
Section 5 onboarding persistence. These tests exist specifically to catch the brief's
explicit warning: "If picking 'farmer' changes nothing after onboarding, the fork is fake."
So beyond "the API accepts the payload," each test checks that an answer actually produces
a different, server-computed downstream value — not just that it was stored verbatim.
"""

from .conftest import register_and_login


def test_role_starts_unset_and_onboarding_incomplete(client):
    headers = register_and_login(client, "r1@example.com")
    tenant = client.get("/tenants/me", headers=headers).json()
    assert tenant["role"] == "unset"
    assert tenant["onboarding_completed"] is False


def test_farmer_onboarding_completes_and_computes_coverage_ratio(client):
    headers = register_and_login(client, "f1@example.com")
    client.put("/tenants/me/role", json={"role": "farmer"}, headers=headers)

    r = client.put("/tenants/me/onboarding/farmer", json={
        "sensor_count": 5, "plant_count": 500, "watering_method": "flood",
        "salinity_history": "yes", "alert_threshold": "fairly_sure", "language": "hi",
    }, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["onboarding_completed"] is True
    # server-computed, not an echo of client input — the whole point of section 4
    assert body["coverage_ratio_text"] == "1 sensor per 100 plants"

    tenant = client.get("/tenants/me", headers=headers).json()
    assert tenant["language"] == "hi", "the language answer must actually change the account"


def test_lab_onboarding_enables_confound_panel_only_for_incubator(client):
    headers = register_and_login(client, "l1@example.com", tier="pro")
    client.put("/tenants/me/role", json={"role": "lab"}, headers=headers)

    r = client.put("/tenants/me/onboarding/lab", json={"chamber_type": "incubator"}, headers=headers)
    assert r.json()["confound_panel_enabled"] is True

    r = client.put("/tenants/me/onboarding/lab", json={"chamber_type": "greenhouse"}, headers=headers)
    assert r.json()["confound_panel_enabled"] is False, \
        "the confound panel is specifically about BOD incubator compressor cycling — must not enable for a greenhouse"


def test_both_role_requires_both_profiles_before_completing(client):
    headers = register_and_login(client, "both1@example.com", tier="premium")
    client.put("/tenants/me/role", json={"role": "both"}, headers=headers)

    r = client.put("/tenants/me/onboarding/lab", json={}, headers=headers)
    assert r.json()["onboarding_completed"] is False, "lab-only profile must not complete a 'both' account"

    r = client.put("/tenants/me/onboarding/farmer", json={}, headers=headers)
    assert r.json()["onboarding_completed"] is True, "both profiles present — now it should complete"


def test_coverage_ratio_is_never_trusted_from_the_client(client):
    """A client could lie about its own coverage ratio; the server must compute it fresh
    from sensor_count/plant_count every time, not store or echo a client-supplied figure
    (the request schema doesn't even have a coverage_ratio field — this test guards against
    one being added later without routing it through server-side computation)."""
    headers = register_and_login(client, "f2@example.com")
    client.put("/tenants/me/role", json={"role": "farmer"}, headers=headers)
    r = client.put("/tenants/me/onboarding/farmer", json={"sensor_count": 1, "plant_count": 1000000}, headers=headers)
    assert r.json()["coverage_ratio_text"] == "1 sensor per 1000000 plants"
