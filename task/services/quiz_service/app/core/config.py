from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")
    APP_NAME:       str = "EdTech Quiz Service"
    ENV:            str = "development"
    DEBUG:          bool = False

    # Error tracking — empty by default (no-op). Set to a real Sentry DSN
    # in production only; local/dev never sends events.
    SENTRY_DSN: str = ""

    DATABASE_URL:   str
    REDIS_URL:      str
    # This service never verifies JWTs locally — it calls auth_service's
    # /api/v1/auth/verify API (the single authentication authority) and
    # holds no signing secret of its own.
    AUTH_SERVICE_URL: str = "http://auth_service:8000"
    RABBITMQ_URL:   str = "amqp://edtech:edtech_rabbit@rabbitmq:5672//"
    # Best-effort, fire-and-forget call on quiz completion to power the
    # Friend Activity feed ("Mohit got 95% in Biology Quiz"). Never blocks
    # or fails a submission if gamification_service is unreachable.
    GAMIFICATION_SERVICE_URL: str = "http://gamification_service:8000"
    # Best-effort, fire-and-forget call on quiz completion to feed the
    # student's real per-chapter progress into analytics_service.
    ANALYTICS_SERVICE_URL: str = "http://analytics_service:8000"
    # Best-effort, fire-and-forget call on quiz completion to queue a
    # delayed "practice this weak topic" nudge.
    NOTIFICATION_SERVICE_URL: str = "http://notification_service:8000"
    # Best-effort, fire-and-forget call on quiz completion so a referred
    # user's "complete a quiz" qualification step re-checks itself.
    REFERRAL_SERVICE_URL: str = "http://referral_service:8000"

    # Shared secret every service-to-service call to an /internal/* route
    # must present via the X-Internal-Secret header (checked by
    # require_internal, in addition to the RFC1918 IP check). Same value in
    # every service's .env — fails closed (rejects) if unset.
    INTERNAL_SERVICE_SECRET: str = ""


settings = Settings()
