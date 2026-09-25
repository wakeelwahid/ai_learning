from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    APP_NAME: str = "EdTech Notification Service"
    ENV: str = "development"
    DEBUG: bool = False

    # Error tracking — empty by default (no-op). Set to a real Sentry DSN
    # in production only; local/dev never sends events.
    SENTRY_DSN: str = ""

    DATABASE_URL: str
    REDIS_URL: str

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM_NAME: str = "EdTech Platform"

    WHATSAPP_API_KEY: str = ""
    WHATSAPP_FROM_NUMBER: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    FCM_SERVER_KEY: str = ""  # legacy — kept for reference, not used
    FIREBASE_CREDENTIALS_PATH: str = ""  # path to service account JSON for firebase-admin SDK

    # This service never verifies JWTs locally — it calls auth_service's
    # /api/v1/auth/verify API (the single authentication authority) and
    # holds no signing secret of its own.
    AUTH_SERVICE_URL: str = "http://auth_service:8000"

    # Used by the morning "Today's Goal" job (reads today's daily challenge)
    # and the afternoon "Friend Activity" job (reads friends' recent activity).
    GAMIFICATION_SERVICE_URL: str = "http://gamification_service:8000"
    # Used by the Battle Reminder job (polls for battles starting soon).
    BATTLE_SERVICE_URL: str = "http://battle_service:8000"
    # Used by the weekly parent-summary job to find parents with an
    # APPROVED child link (parent_profiles lives in user_service's DB).
    USER_SERVICE_URL: str = "http://user_service:8000"

    # Shared secret every service-to-service call to an /internal/* route
    # must present via the X-Internal-Secret header (checked by
    # require_internal, in addition to the RFC1918 IP check). Same value in
    # every service's .env — fails closed (rejects) if unset.
    INTERNAL_SERVICE_SECRET: str = ""

    FRONTEND_URL: str = "https://app.edtech.com"

    # Celery
    RABBITMQ_URL: str = "amqp://edtech:edtech_rabbit@localhost:5672//"
    CELERY_RESULT_BACKEND: str = ""  # filled from REDIS_URL if empty


settings = Settings()
