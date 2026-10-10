from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    APP_NAME: str = "EdTech Content Service"
    ENV: str = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Error tracking — empty by default (no-op). Set to a real Sentry DSN
    # in production only; local/dev never sends events.
    SENTRY_DSN: str = ""

    DATABASE_URL: str
    REDIS_URL: str

    # This service never verifies JWTs locally — it calls auth_service's
    # /api/v1/auth/verify API (the single authentication authority) and
    # holds no signing secret of its own.
    AUTH_SERVICE_URL: str = "http://auth_service:8000"
    USER_SERVICE_URL: str = "http://user_service:8000"
    GAMIFICATION_SERVICE_URL: str = "http://gamification_service:8000"
    # Used to gate premium videos/notes — content_service asks payment_service
    # whether the viewer has an active (or parent-inherited) subscription.
    PAYMENT_SERVICE_URL: str = "http://payment_service:8000"
    ANALYTICS_SERVICE_URL: str = "http://analytics_service:8000"
    REFERRAL_SERVICE_URL: str = "http://referral_service:8000"

    # Shared secret every service-to-service call to an /internal/* route
    # must present via the X-Internal-Secret header (checked by
    # require_internal, in addition to the RFC1918 IP check). Same value in
    # every service's .env — fails closed (rejects) if unset.
    INTERNAL_SERVICE_SECRET: str = ""

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET: str = "edtech-assets"
    S3_REGION: str = "ap-south-1"

    # MinIO object storage (S3-compatible CDN)
    MINIO_ENDPOINT: str = "http://minio:9000"
    MINIO_ACCESS_KEY: str = "edtech"
    MINIO_SECRET_KEY: str = "edtech_minio_2024"
    MINIO_BUCKET: str = "edtech-content"

    # Cache TTLs (seconds)
    CHAPTER_CACHE_TTL: int = 86400 * 30       # 30 days
    VIDEO_PROGRESS_CACHE_TTL: int = 86400 * 90  # 90 days
    CONTINUE_WATCHING_CACHE_TTL: int = 120     # 2 minutes — new videos should appear quickly
    CATALOG_CACHE_TTL: int = 3600              # 1 hour — catalog changes are infrequent
    VIDEO_FEED_CACHE_TTL: int = 600            # 10 minutes
    USER_BC_CACHE_TTL: int = 300               # 5 minutes — safety net; user_service invalidates on profile change


settings = Settings()
