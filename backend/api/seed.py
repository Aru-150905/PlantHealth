"""
Seed script — PlantHealth API. Per section 11: "Seed script that creates demo tenants on
each tier with plausible data." Safe to re-run: clears and recreates the demo rows it owns
(identified by a fixed set of demo emails) rather than wiping the whole database.

Run: cd backend && source .venv/bin/activate && python -m api.seed
"""

from __future__ import annotations

from .db import Base, SessionLocal, engine
from .ml_runtime import ModelNotTrainedError, runtime
from .models import AlertLog, Device, GroundTruthUpload, Plant, Role, Tenant, Tier, User
from .security import hash_password

DEMO_PASSWORD = "demo-password-123"

# Onboarding profiles are seeded too (not left empty) so a demo login lands straight on the
# field map / signal viewer with "its first reading" (section 5), rather than being forced
# through the onboarding wizard it technically never ran — the whole point of a seed script
# "with plausible data" (section 11).
_BASIC_FARMER_PROFILE = {
    "crop": "tomato", "plant_count": 95, "sensor_count": 1,
    "field_layout": {"kind": "rows", "rows": 8, "spacing_m": 1.0},
    "watering_method": "drip", "salinity_history": "no",
    "region": "Punjab, India", "season": "Kharif",
    "alert_threshold": "fairly_sure", "language": "en",
}
_PREMIUM_FARMER_PROFILE = {
    "crop": "tomato", "plant_count": 600, "sensor_count": 4,
    "field_layout": {"kind": "grid", "grid_width": 20, "grid_height": 30},
    "watering_method": "flood", "salinity_history": "yes",
    "region": "Central Valley, California", "season": "summer",
    "alert_threshold": "tell_me_early", "language": "en",
}
_PRO_LAB_PROFILE = {
    "species": "tomato", "n_plants": 6, "n_treatment_arms": 3, "replicates_per_arm": 2,
    "stresses": ["drought", "heat", "salinity"], "chamber_type": "incubator",
    "light_hours_on": 16.0, "light_hours_off": 8.0, "light_switch_time": "06:00",
    "sampling_rate_hz": 10.0, "electrode_config": "differential leaf pair + stem reference",
    "n_channels": 3, "amplifier_gain": 1000.0, "has_ground_truth_assay": True,
    "show_random_split_comparison": True, "export_retention_preference": "CSV monthly, retain indefinitely",
}
_BOTH_FARMER_PROFILE = {
    "crop": "tomato", "plant_count": 100, "sensor_count": 2,
    "field_layout": {"kind": "rows", "rows": 10, "spacing_m": 1.2},
    "watering_method": "sprinkler", "salinity_history": "unsure",
    "region": "Maharashtra, India", "season": "Rabi",
    "alert_threshold": "fairly_sure", "language": "en",
}
_BOTH_LAB_PROFILE = {
    "species": "tomato", "n_plants": 8, "n_treatment_arms": 4, "replicates_per_arm": 2,
    "stresses": ["drought", "heat", "salinity", "control"], "chamber_type": "growth_room",
    "light_hours_on": 14.0, "light_hours_off": 10.0, "light_switch_time": "07:00",
    "sampling_rate_hz": 10.0, "n_channels": 2, "amplifier_gain": 1000.0,
    "has_ground_truth_assay": False, "show_random_split_comparison": False,
}

DEMO_ACCOUNTS = [
    {"tenant_name": "Basic Farm Co-op", "email": "basic@demo.planthealth", "tier": Tier.basic, "role": Role.farmer,
     "n_devices": 1, "n_plants_per_device": 95, "farmer_profile": _BASIC_FARMER_PROFILE},
    {"tenant_name": "Premium Growers Ltd", "email": "premium@demo.planthealth", "tier": Tier.premium, "role": Role.farmer,
     "n_devices": 4, "n_plants_per_device": 150, "farmer_profile": _PREMIUM_FARMER_PROFILE},
    {"tenant_name": "Riverside Plant Physiology Lab", "email": "pro@demo.planthealth", "tier": Tier.pro, "role": Role.lab,
     "n_devices": 6, "n_plants_per_device": 1, "lab_profile": _PRO_LAB_PROFILE},
    {"tenant_name": "Dual-Role Demo Account", "email": "both@demo.planthealth", "tier": Tier.premium, "role": Role.both,
     "n_devices": 2, "n_plants_per_device": 50, "farmer_profile": _BOTH_FARMER_PROFILE, "lab_profile": _BOTH_LAB_PROFILE},
]

ADMIN_EMAIL = "admin@demo.planthealth"


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        demo_emails = [a["email"] for a in DEMO_ACCOUNTS] + [ADMIN_EMAIL]
        existing_tenant_ids = [
            tid for (tid,) in db.query(User.tenant_id).filter(User.email.in_(demo_emails)).all()
        ]
        # AlertLog/GroundTruthUpload aren't in Tenant's cascade relationships, so clear them
        # explicitly; Query.delete() is a bulk op that bypasses ORM cascades entirely, which
        # is why a plain `Tenant...delete()` here used to leave Users/Devices/Plants behind
        # as orphans and break the next re-run with a duplicate-email conflict. Users are
        # deleted directly (not left to cascade) so this stays correct even against a
        # database already left in that orphaned state by the old version of this script.
        if existing_tenant_ids:
            db.query(AlertLog).filter(AlertLog.tenant_id.in_(existing_tenant_ids)).delete(synchronize_session=False)
            db.query(GroundTruthUpload).filter(GroundTruthUpload.tenant_id.in_(existing_tenant_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.email.in_(demo_emails)).delete(synchronize_session=False)
        if existing_tenant_ids:
            for tenant in db.query(Tenant).filter(Tenant.id.in_(existing_tenant_ids)).all():
                db.delete(tenant)  # ORM delete so cascade="all, delete-orphan" removes devices/plants too
        db.commit()

        for acc in DEMO_ACCOUNTS:
            profile = {}
            if "farmer_profile" in acc:
                profile["farmer"] = acc["farmer_profile"]
            if "lab_profile" in acc:
                profile["lab"] = acc["lab_profile"]
            needed = {"farmer", "lab"} if acc["role"] == Role.both else {acc["role"].value}

            tenant = Tenant(
                name=acc["tenant_name"], tier=acc["tier"], role=acc["role"],
                onboarding_profile=profile, onboarding_completed=needed.issubset(profile.keys()),
            )
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
