from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    APP_NAME: str = "EdTech API Gateway"
    ENV: str = "development"
    DEBUG: bool = False

    # Error tracking — empty by default (no-op). Set to a real Sentry DSN
    # in production only; local/dev never sends events.
    SENTRY_DSN: str = ""

    # CORS is configured centrally by shared/cors.py, which reads ENV /
    # CORS_ORIGINS_PRODUCTION / CORS_ORIGINS_DEVELOPMENT directly from the
    # environment — see that module, not this Settings class.

    # Redis (used by rate limiter)
    REDIS_URL: str = "redis://localhost:6381"

    # Rate limiting (requests per minute per IP) — generic default for routes
    # with no override below
    RATE_LIMIT_PER_MINUTE: int = 120

    # Route-specific rate-limit overrides (see _ROUTE_LIMITS in
    # app/middleware/rate_limit.py, which reads these instead of hardcoded
    # numbers). Dev-friendly defaults below — tighten these via .env for
    # production (e.g. RATE_LIMIT_OTP_SEND=5).
    RATE_LIMIT_LOGIN: int = 30              # brute-force protection
    RATE_LIMIT_REGISTER: int = 20           # registration spam protection
    RATE_LIMIT_FORGOT_PASSWORD: int = 5     # prevent email flooding
    RATE_LIMIT_OTP_SEND: int = 15           # SMS costs money — prevent SMS-bombing abuse
    RATE_LIMIT_OTP_VERIFY: int = 20         # OTP guessing
    RATE_LIMIT_AUTH_OTHER: int = 60         # other /auth/ routes
    RATE_LIMIT_QUIZ_SUBMIT: int = 5         # anti-farm: per-user
    RATE_LIMIT_AI: int = 100                # AI routes — LLM-bound, lower limit
    RATE_LIMIT_COUPON_VALIDATE: int = 10    # unauthenticated + human-guessable codes
    RATE_LIMIT_PAYMENT_ORDER: int = 10      # card-testing / checkout-abuse protection
    RATE_LIMIT_REFERRAL_REGISTER: int = 10  # referral-farming protection
    RATE_LIMIT_CHAT_SEND: int = 60          # spam/flood protection, generous for real group chat
    RATE_LIMIT_FILE_UPLOAD: int = 20        # storage-cost / abuse protection

    # ── Upstream service URLs ──────────────────────────────────────────────────
    AUTH_SERVICE_URL: str         = "http://localhost:8001"
    USER_SERVICE_URL: str         = "http://localhost:8002"
    CONTENT_SERVICE_URL: str      = "http://localhost:8003"
    QUIZ_SERVICE_URL: str         = "http://localhost:8004"
    AI_SERVICE_URL: str           = "http://localhost:8005"
    PAYMENT_SERVICE_URL: str      = "http://localhost:8006"
    NOTIFICATION_SERVICE_URL: str = "http://localhost:8007"
    ANALYTICS_SERVICE_URL: str    = "http://localhost:8008"
    GAMIFICATION_SERVICE_URL: str = "http://localhost:8009"
    REFERRAL_SERVICE_URL: str     = "http://localhost:8011"
    BATTLE_SERVICE_URL: str       = "http://localhost:8010"
    CAREER_SERVICE_URL: str       = "http://localhost:8012"

    # Prometheus already scrapes every service's /metrics (each service wires
    # prometheus_fastapi_instrumentator) — the admin latency/usage dashboard
    # queries it directly rather than building a parallel timing pipeline.
    PROMETHEUS_URL: str = "http://prometheus:9090"


settings = Settings()
