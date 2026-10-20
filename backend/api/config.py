"""
Settings — PlantHealth API.

SECRET_KEY has a dev default so the app runs out of the box per the brief's "everything
runs locally with one command." It is NOT safe for a real deployment — override it via the
PLANTHEALTH_SECRET_KEY env var before deploying anywhere this matters. This is a stub-billing,
local-first demo app (see "Do not add a login flow to a real payment provider" in the brief),
not a hardened production auth system.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PLANTHEALTH_")

    secret_key: str = "dev-only-insecure-secret-change-me"
    access_token_expire_minutes: int = 60 * 24  # 1 day — convenient for local demo use
    database_url: str = f"sqlite:///{BACKEND_DIR / 'plant_health.db'}"

    ml_models_dir: Path = BACKEND_DIR / "ml" / "models"
    synthetic_data_dir: Path = BACKEND_DIR / "data" / "generated"


settings = Settings()
