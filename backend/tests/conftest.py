import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A fresh, isolated SQLite DB per test — set the env var BEFORE importing api.main,
    since config.settings reads it once at import time."""
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("PLANTHEALTH_DATABASE_URL", f"sqlite:///{db_path}")

    # Force a clean re-import of every api.* module so config.settings picks up the env var
    # above rather than reusing a cached settings object from a previous test.
    for mod in list(sys.modules):
        if mod.startswith("api."):
            del sys.modules[mod]

    from api.main import app
    with TestClient(app) as c:
        yield c


def register_and_login(client, email="t@example.com", tier="basic", tenant_name="Test Tenant"):
    r = client.post("/auth/register", json={
        "tenant_name": tenant_name, "email": email, "password": "password123", "tier": tier,
    })
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
