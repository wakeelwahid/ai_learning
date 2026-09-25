from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    # Error tracking — empty by default (no-op). Set to a real Sentry DSN
    # in production only; local/dev never sends events.
    SENTRY_DSN: str = ""

    DATABASE_URL:            str = "postgresql+asyncpg://postgres:password@localhost:5450/edtech_battles"
    REDIS_URL:               str = "redis://localhost:6381/11"
    GROQ_API_KEY:            str = ""
    GROQ_MODEL:              str = "llama-3.1-8b-instant"
    GAMIFICATION_SERVICE_URL: str = "http://localhost:8009"
    # This service never verifies JWTs locally — it calls auth_service's
    # /api/v1/auth/verify API (the single authentication authority) and
    # holds no signing secret of its own.
    AUTH_SERVICE_URL: str = "http://auth_service:8000"
    # Challenge-a-friend: friendship is verified against user_service's friend
    # graph, and the challenged friend gets a durable in-app notification plus
    # a queued push via notification_service. Both ride the private network.
    USER_SERVICE_URL:         str = "http://user_service:8000"
    NOTIFICATION_SERVICE_URL: str = "http://notification_service:8000"

    # Shared secret every service-to-service call to an /internal/* route
    # must present via the X-Internal-Secret header (checked by
    # require_internal, in addition to the RFC1918 IP check). Same value in
    # every service's .env — fails closed (rejects) if unset.
    INTERNAL_SERVICE_SECRET: str = ""


settings = Settings()
