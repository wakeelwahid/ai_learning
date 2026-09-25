from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    APP_NAME: str = "EdTech Payment Service"
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
    # Internal-only user_service base URL — used to verify parent-child
    # relationships before serving/creating cross-user billing data.
    USER_SERVICE_URL: str = "http://user_service:8000"

    # Shared secret every service-to-service call to an /internal/* route
    # must present via the X-Internal-Secret header (checked by
    # require_internal, in addition to the RFC1918 IP check). Same value in
    # every service's .env — fails closed (rejects) if unset.
    INTERNAL_SERVICE_SECRET: str = ""

    # Public base URL of the API gateway — used to build Cashfree's
    # notify_url (server-to-server webhook target, must be gateway-reachable).
    APP_BASE_URL: str = "http://localhost:9000"
    # Public base URL of the web frontend — used to build Cashfree's
    # return_url (browser/WebView redirect target after checkout completes).
    # Mirrors auth_service/user_service's own FRONTEND_URL setting.
    FRONTEND_URL: str = "http://localhost:3002"

    # Cashfree Payment Gateway — https://docs.cashfree.com/reference/pg-new-apis-endpoint
    # Left as placeholders: when CASHFREE_APP_ID isn't a real Cashfree app id
    # (doesn't start with a real client id format), the service runs in
    # test_mode and mocks orders locally instead of calling the Cashfree API —
    # identical fallback behaviour to the old Razorpay integration's test_mode.
    CASHFREE_APP_ID: str = "test"
    CASHFREE_SECRET_KEY: str = "test_secret"
    CASHFREE_WEBHOOK_SECRET: str = ""
    CASHFREE_ENV: str = "sandbox"  # "sandbox" | "production"
    CASHFREE_API_VERSION: str = "2023-08-01"

    # Fallback seed pricing for the `plans` table — only used the very first
    # time the service boots against an empty table. After that, all plan
    # data (price/duration/features/etc.) is admin-managed via
    # /api/v1/payments/admin/plans and read from the DB, not from here.
    PLAN_MONTHLY_AMOUNT:   int = 14900   # ₹149 / 1 month
    PLAN_QUARTERLY_AMOUNT: int = 29900   # ₹299 / 3 months
    PLAN_ANNUAL_AMOUNT:    int = 69900   # ₹699 / 1 year
    CURRENCY: str = "INR"

    @model_validator(mode="after")
    def _validate_payment_mode_matches_env(self) -> "Settings":
        """Fail closed at startup rather than silently misbehave in
        production: a deploy with ENV=production must not be able to run on
        placeholder Cashfree test credentials (real-looking checkout, no real
        money moves), and CASHFREE_ENV=production must not be paired with
        ENV=development (real charges from a dev box)."""
        app_id = self.CASHFREE_APP_ID or ""
        is_placeholder_app_id = not app_id or app_id == "test"
        if self.ENV == "production" and is_placeholder_app_id:
            raise ValueError(
                "ENV=production but CASHFREE_APP_ID is unset/placeholder — "
                "payments would silently run in test mode. Set real Cashfree "
                "credentials before deploying to production."
            )
        if self.CASHFREE_ENV == "production" and self.ENV != "production":
            raise ValueError(
                "CASHFREE_ENV=production but ENV is not production — refusing "
                "to process real charges from a non-production deployment."
            )
        # Same fail-closed-at-startup reasoning for the webhook secret: once the
        # app id is real, is_test_mode() is False and routes/webhooks.py rejects
        # every delivery with 503 when this is unset. That failure is invisible
        # until a real payment arrives, and it disables the webhook backstop
        # that activates subscriptions when the client never calls /verify.
        if not is_placeholder_app_id and not self.CASHFREE_WEBHOOK_SECRET:
            raise ValueError(
                "Real Cashfree credentials are configured but "
                "CASHFREE_WEBHOOK_SECRET is unset — webhook signature "
                "verification would reject every delivery with 503."
            )
        return self


settings = Settings()
