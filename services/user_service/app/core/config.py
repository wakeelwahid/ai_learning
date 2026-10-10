from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")
    APP_NAME: str = "EdTech User Service"
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
    FRONTEND_URL: str = "http://localhost:3002"
    NOTIFICATION_SERVICE_URL: str = "http://notification_service:8000"
    ANALYTICS_SERVICE_URL: str = "http://analytics_service:8000"
    # Used by FeatureUsageService quota checks (chat messages, group
    # creation, friend requests) — see gamification_service's
    # internal/usage/check-and-log.
    GAMIFICATION_SERVICE_URL: str = "http://gamification_service:8000"
    # content_service caches each student's board/class for /my-catalog —
    # invalidated via its internal route whenever board/class change.
    CONTENT_SERVICE_URL: str = "http://content_service:8000"
    # Public gateway origin baked into uploaded-avatar URLs (avatar_url =
    # "<PUBLIC_GATEWAY_URL>/api/v1/users/avatar/<user_id>?v=N") — must be the
    # address browsers/apps reach the API on, not the docker-internal alias.
    PUBLIC_GATEWAY_URL: str = "http://localhost:9000"

    # Shared secret every service-to-service call to an /internal/* route
    # must present via the X-Internal-Secret header (checked by
    # require_internal, in addition to the RFC1918 IP check). Same value in
    # every service's .env — fails closed (rejects) if unset.
    INTERNAL_SERVICE_SECRET: str = ""

    # Parent-student linking caps — enforced in UserService.link_student()/
    # link_parent(). Counts EVERY link row (pending + approved) against both
    # caps, not just approved ones: an unapproved link already occupies a
    # real row a parent created and a student would otherwise have to deal
    # with, so leaving it uncounted would let a parent create unlimited
    # pending requests against one student, or hold unlimited pending slots
    # of their own, defeating the cap's anti-abuse purpose.
    MAX_STUDENTS_PER_PARENT: int = 7
    MAX_PARENTS_PER_STUDENT: int = 3

settings = Settings()
