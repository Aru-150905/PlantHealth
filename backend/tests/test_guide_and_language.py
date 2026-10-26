from .conftest import register_and_login


def test_register_stores_language(client):
    r = client.post("/auth/register", json={
        "tenant_name": "Hindi Farm", "email": "hi@example.com", "password": "password123",
        "tier": "basic", "language": "hi",
    })
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/tenants/me", headers=headers).json()["language"] == "hi"


def test_register_language_defaults_to_english(client):
    headers = register_and_login(client, "en@example.com")
    assert client.get("/tenants/me", headers=headers).json()["language"] == "en"


def test_guide_defaults_to_none_and_can_be_set(client):
    headers = register_and_login(client, "guide1@example.com")
    assert client.get("/tenants/me", headers=headers).json()["guide_character"] is None

    r = client.put("/tenants/me/guide", json={"guide_character": "didi"}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["guide_character"] == "didi"
    assert client.get("/tenants/me", headers=headers).json()["guide_character"] == "didi"

    r = client.put("/tenants/me/guide", json={"guide_character": "bhaiya"}, headers=headers)
    assert r.json()["guide_character"] == "bhaiya"


def test_guide_rejects_unknown_value(client):
    headers = register_and_login(client, "guide2@example.com")
    r = client.put("/tenants/me/guide", json={"guide_character": "robot"}, headers=headers)
    assert r.status_code == 422
