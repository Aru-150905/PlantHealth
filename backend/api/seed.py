"""
Seed script — PlantHealth API. Per section 11: "Seed script that creates demo tenants on
each tier with plausible data." Safe to re-run: clears and recreates the demo rows it owns
(identified by a fixed set of demo emails) rather than wiping the whole database.

Run: cd backend && source .venv/bin/activate && python -m api.seed
"""

from __future__ import annotations

from .db import Base, SessionLocal, engine
from .ml_runtime import ModelNotTrainedError, runtime
from .models import Device, Plant, Role, Tenant, Tier, User
from .security import hash_password

DEMO_PASSWORD = "demo-password-123"

DEMO_ACCOUNTS = [
    {"tenant_name": "Basic Farm Co-op", "email": "basic@demo.planthealth", "tier": Tier.basic, "role": Role.farmer, "n_devices": 1, "n_plants_per_device": 95},
    {"tenant_name": "Premium Growers Ltd", "email": "premium@demo.planthealth", "tier": Tier.premium, "role": Role.farmer, "n_devices": 4, "n_plants_per_device": 150},
    {"tenant_name": "Riverside Plant Physiology Lab", "email": "pro@demo.planthealth", "tier": Tier.pro, "role": Role.lab, "n_devices": 6, "n_plants_per_device": 1},
    {"tenant_name": "Dual-Role Demo Account", "email": "both@demo.planthealth", "tier": Tier.premium, "role": Role.both, "n_devices": 2, "n_plants_per_device": 50},
]

ADMIN_EMAIL = "admin@demo.planthealth"


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        demo_emails = [a["email"] for a in DEMO_ACCOUNTS] + [ADMIN_EMAIL]
        existing = db.query(User).filter(User.email.in_(demo_emails)).all()
        for u in existing:
            db.query(Tenant).filter(Tenant.id == u.tenant_id).delete()
        db.commit()

        for acc in DEMO_ACCOUNTS:
            tenant = Tenant(name=acc["tenant_name"], tier=acc["tier"], role=acc["role"])
            db.add(tenant)
            db.flush()

            user = User(tenant_id=tenant.id, email=acc["email"], hashed_password=hash_password(DEMO_PASSWORD))
            db.add(user)

            for i in range(acc["n_devices"]):
                device = Device(
                    tenant_id=tenant.id, serial=f"PH-{tenant.id[:6]}-{i:02d}",
                    battery_pct=round(60 + 35 * ((i * 37) % 100) / 100, 1),
                    signal_quality=round(0.75 + 0.2 * ((i * 53) % 100) / 100, 2),
                    electrode_drift_flagged=(i == 0 and acc["tier"] == Tier.basic),
                )
                db.add(device)
                db.flush()
                plant = Plant(
                    tenant_id=tenant.id, device_id=device.id, label=f"Block {i + 1}",
                    covered_count=acc["n_plants_per_device"], row=i, col=0,
                )
                db.add(plant)

        admin_tenant = Tenant(name="PlantHealth Platform", tier=Tier.pro, role=Role.lab)
        db.add(admin_tenant)
        db.flush()
        db.add(User(tenant_id=admin_tenant.id, email=ADMIN_EMAIL, hashed_password=hash_password(DEMO_PASSWORD), is_admin=True))

        db.commit()
        print(f"Seeded {len(DEMO_ACCOUNTS)} demo tenants + 1 admin account.")
        for acc in DEMO_ACCOUNTS:
            print(f"  {acc['tier'].value:8s} {acc['role'].value:7s} {acc['email']:32s} password={DEMO_PASSWORD}")
        print(f"  admin             {ADMIN_EMAIL:32s} password={DEMO_PASSWORD}")

        try:
            runtime._ensure_loaded()
            print(f"\nML model loaded OK (version {runtime.model_version}, trained on synthetic data).")
        except ModelNotTrainedError as e:
            print(f"\nNote: ML model not trained yet — predictions will 503 until you run "
                  f"`python ml/train.py` ({e})")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
