from .conftest import register_and_login


def test_register_then_access_protected_route(client):
    headers = register_and_login(client)
    r = client.get("/tenants/me", headers=headers)
    assert r.status_code == 200


def test_duplicate_email_rejected(client):
    register_and_login(client, "dup@example.com")
    r = client.post("/auth/register", json={
        "tenant_name": "Other", "email": "dup@example.com", "password": "password123", "tier": "basic",
    })
    assert r.status_code == 409


def test_login_with_wrong_password_rejected(client):
    register_and_login(client, "pw@example.com")
    r = client.post("/auth/login", data={"username": "pw@example.com", "password": "wrong-password"})
    assert r.status_code == 401


def test_protected_route_without_token_rejected(client):
    r = client.get("/tenants/me")
    assert r.status_code == 401


def test_protected_route_with_garbage_token_rejected(client):
    r = client.get("/tenants/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401


def test_tenant_isolation_cannot_see_another_tenants_plant(client):
    """A core multi-tenant invariant: tenant A must not be able to read/act on tenant B's
    resources even with a valid token of their own."""
    headers_a = register_and_login(client, "a@example.com", tenant_name="Tenant A")
    headers_b = register_and_login(client, "b@example.com", tenant_name="Tenant B")

    plant_id = client.post("/plants", json={"covered_count": 1}, headers=headers_a).json()["id"]

    r = client.delete(f"/plants/{plant_id}", headers=headers_b)
    assert r.status_code == 404  # not 403 — tenant B shouldn't even learn it exists

    r = client.post(f"/plants/{plant_id}/predict", json={}, headers=headers_b)
    assert r.status_code == 404
