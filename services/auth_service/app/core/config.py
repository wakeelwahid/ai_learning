from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    # App
    APP_NAME: str = "EdTech Auth Service"
    ENV: str = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Error tracking — empty by default (no-op). Set to a real Sentry DSN
    # in production only; local/dev never sends events.
    SENTRY_DSN: str = ""

    # Fail-safe environment gate for the OTP dev bypass (see phone_otp_service).
    # Defaults to "production" ON PURPOSE: if APP_ENV is ever missing, unset,
    # misspelled ("dev", "Development", "staging") or blank, the safe outcome
    # must be "bypass disabled", never "bypass enabled". Only the exact
    # literal string "development" turns the bypass on — this is intentionally
    # NOT a bool and NOT tied to DEBUG (which is used only for docs/SQL-echo/
    # logging verbosity elsewhere and must stay fully independent of auth).
    APP_ENV: str = "production"

    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str
    REDIS_DB: int = 0

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # Sessions older than this (days with zero activity) are considered expired
    INACTIVITY_EXPIRE_DAYS: int = 7

    # Email verification / password reset
    EMAIL_VERIFICATION_EXPIRE_HOURS: int = 24

    # OTP
    OTP_MAX_ATTEMPTS: int = 5
    OTP_TTL_SECONDS: int = 600
    # Static test code accepted for phone-OTP verify ONLY when BOTH
    # APP_ENV == "development" (exact literal match, see APP_ENV above) AND
    # this value is non-empty (an empty/unset DEV_OTP_CODE must never match,
    # including against an empty otp string). No real SMS provider is
    # configured in local dev, so this lets the dev/test flow proceed without
    # reading the real code out of the DB every time. Never set this outside
    # a fully isolated local dev machine; in any non-development APP_ENV it
    # has zero effect no matter what it's set to.
    DEV_OTP_CODE: str = "000000"

    # Rate limiting
    AUTH_RATE_LIMIT: int = 10
    REGISTER_RATE_LIMIT: int = 5

    # Downstream URLs
    NOTIFICATION_SERVICE_URL: str = "http://notification_service:8000"
    USER_SERVICE_URL: str = "http://user_service:8000"
    # Best-effort daily_activity logged_in=true ping on every successful session creation.
    ANALYTICS_SERVICE_URL: str = "http://analytics_service:8000"
    FRONTEND_URL: str = "http://localhost:3002"

    # ── OAuth2 Social Auth ────────────────────────────────────────────────────
    OAUTH_REDIRECT_BASE_URL: str = "http://localhost:9000"   # API gateway URL

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Shared secret every service-to-service call to an /internal/* route
    # must present via the X-Internal-Secret header (checked by
    # require_internal, in addition to the RFC1918 IP check). Same value in
    # every service's .env — fails closed (rejects) if unset.
    INTERNAL_SERVICE_SECRET: str = ""

    # ── Default admin seed ────────────────────────────────────────────────────
    ADMIN_EMAIL: str = "admin@edtech.com"
    ADMIN_PASSWORD: str = "Admin@123"


settings = Settings()
