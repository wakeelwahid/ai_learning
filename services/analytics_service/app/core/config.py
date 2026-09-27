from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")
    APP_NAME: str = "EdTech Analytics Service"
    ENV: str = "development"
    DEBUG: bool = False

    # Error tracking — empty by default (no-op). Set to a real Sentry DSN
    # in production only; local/dev never sends events.
    SENTRY_DSN: str = ""

    DATABASE_URL: str
    REDIS_URL: str
    # This service never verifies JWTs locally — it calls auth_service's
    # /api/v1/auth/verify API (the single authentication authority) and
    # holds no signing secret of its own.
    AUTH_SERVICE_URL: str = "http://auth_service:8000"
    # Internal, Docker-network-only base URL for user_service (parent-child link checks, etc.)
    USER_SERVICE_URL: str = "http://user_service:8000"
    # Real admin-stats sources this service delegates to rather than
    # maintaining its own duplicate/stale aggregation (see /admin/battle-stats,
    # /admin/revenue) — both require the caller's own admin JWT forwarded.
    BATTLE_SERVICE_URL: str = "http://battle_service:8000"
    PAYMENT_SERVICE_URL: str = "http://payment_service:8000"
    GAMIFICATION_SERVICE_URL: str = "http://gamification_service:8000"
    # Parent-summary enrichment: subject names (content) and class leaderboard rank (quiz).
    CONTENT_SERVICE_URL: str = "http://content_service:8000"
    QUIZ_SERVICE_URL: str = "http://quiz_service:8000"

    # Shared secret every service-to-service call to an /internal/* route
    # must present via the X-Internal-Secret header (checked by
    # require_internal, in addition to the RFC1918 IP check). Same value in
    # every service's .env — fails closed (rejects) if unset.
    INTERNAL_SERVICE_SECRET: str = ""

settings = Settings()
