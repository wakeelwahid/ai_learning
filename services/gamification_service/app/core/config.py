from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")
    APP_NAME: str = "EdTech Gamification Service"
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
    # Used by the Friend Activity feed to resolve a user's friend list
    # (GET /users/internal/friends) — this service owns no friend-graph
    # data of its own.
    USER_SERVICE_URL: str = "http://user_service:8000"

    # Used by the Challenge Programs feature to verify task completion
    # server-side against each owning service's real records — never a
    # client-asserted "I finished this" flag.
    CONTENT_SERVICE_URL: str = "http://content_service:8000"
    QUIZ_SERVICE_URL: str = "http://quiz_service:8000"
    BATTLE_SERVICE_URL: str = "http://battle_service:8000"
    ANALYTICS_SERVICE_URL: str = "http://analytics_service:8000"
    CHALLENGE_TASK_CHECK_TIMEOUT_SECONDS: float = 3.0

    # Used by FeatureUsageService to resolve a user's plan tier (free vs
    # premium) before checking that tier's daily limit for a feature.
    PAYMENT_SERVICE_URL: str = "http://payment_service:8000"
    PAYMENT_SERVICE_TIMEOUT_SECONDS: float = 3.0

    # Shared secret every service-to-service call to an /internal/* route
    # must present via the X-Internal-Secret header (checked by
    # require_internal, in addition to the RFC1918 IP check). Same value in
    # every service's .env — fails closed (rejects) if unset.
    INTERNAL_SERVICE_SECRET: str = ""

    # ── Tunables (cache TTLs / timeouts / business constants) ──────────────────
    # Simple scalar knobs pulled out of code so they're editable via .env
    # without a redeploy. Large structured game-economy tables (XP_REWARDS,
    # EDUPOINTS_COSTS, LEVEL_XP_THRESHOLDS, FEATURE_LIMIT_SEED, etc.) stay as
    # Python constants in app/models/gamification.py — intentionally not
    # env-configurable here.

    # HTTP timeout for calls this service makes to user_service (friends feed).
    USER_SERVICE_TIMEOUT_SECONDS: float = 3.0

    # Rank-unlock lookup cache — rank shifts slowly; keeps 6k+ concurrent
    # users off a per-request COUNT(*) scan.
    RANK_UNLOCK_CACHE_TTL_SECONDS: int = 30

    # Friends leaderboard cache — friends leaderboard changes slowly; keeps
    # 6k users off Postgres.
    FRIEND_LEADERBOARD_CACHE_TTL_SECONDS: int = 45

    # Feature-usage daily counter Redis key TTL — auto-expires at midnight
    # + 1 min so keys clean up daily.
    FEATURE_USAGE_KEY_TTL_SECONDS: int = 86460

    # Daily-reward claim cooldown — a claim becomes available again exactly
    # this long after the previous one.
    DAILY_REWARD_CLAIM_COOLDOWN_SECONDS: int = 24 * 3600

    # Number of months in a leaderboard/XP season.
    SEASON_DURATION_MONTHS: int = 3

    # Minimum XP a player must hold to enter a friend-challenge stake battle —
    # guarantees the loser can actually pay the CHALLENGE_LOSS stake.
    CHALLENGE_MIN_XP: int = 50

    # Streak freeze shields: max a user can bank, and EduPoints cost each.
    STREAK_FREEZE_MAX: int = 3
    STREAK_FREEZE_COST_EP: int = 50


settings = Settings()
