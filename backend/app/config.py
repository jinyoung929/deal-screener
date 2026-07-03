from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Falls back to a local SQLite file when no Postgres URL is set, so the
    # backend runs end-to-end without a Neon account during local dev.
    database_url: str = "sqlite:///./dealscreener.db"

    dart_api_key: str = ""
    gemini_api_key: str = ""
    sync_secret_token: str = "dev-sync-token"

    google_client_id: str = ""
    google_client_secret: str = ""
    jwt_secret: str = "dev-jwt-secret-change-me"

    frontend_dist_dir: str = "../frontend/dist"


@lru_cache
def get_settings() -> Settings:
    return Settings()
