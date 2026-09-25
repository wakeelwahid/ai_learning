from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    # Error tracking — empty by default (no-op). Set to a real Sentry DSN
    # in production only; local/dev never sends events.
    SENTRY_DSN: str = ""

    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5450/edtech_careers"
    REDIS_URL:    str = "redis://localhost:6381/12"
    GROQ_API_KEY: str = ""
    GROQ_MODEL:   str = "llama-3.1-8b-instant"
    # This service never verifies JWTs locally — it calls auth_service's
    # /api/v1/auth/verify API (the single authentication authority) and
    # holds no signing secret of its own.
    AUTH_SERVICE_URL: str = "http://auth_service:8000"
    GAMIFICATION_SERVICE_URL: str = "http://gamification_service:8000"
    # Shared secret guarding /careers/internal/* (see require_internal).
    INTERNAL_SERVICE_SECRET: str = ""


settings = Settings()
