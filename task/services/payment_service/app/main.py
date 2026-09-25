import json
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import text
from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers
from app.routes.router import api_router
from app.core.config import settings
from app.database.session import engine
from app.database.base import Base

async def _seed_default_plans(conn) -> None:
    """One-time seed of the admin-managed `plans` table from the legacy
    hardcoded pricing, so upgrading deployments keep selling the same 3
    tiers until an admin edits them via /admin/plans. No-op if any plan
    already exists."""
    existing = await conn.execute(text("SELECT COUNT(*) FROM plans"))
    if existing.scalar() > 0:
        return

    all_features = [
        "Unlimited video lessons", "Chapter notes & PDF downloads", "Unlimited quiz & practice",
        "Daily challenges", "XP & level system", "Leaderboard access", "Progress analytics",
        "Unlimited AI Study Chat", "AI Question Generator", "AI Quiz Generator", "AI Custom Generator",
        "Smart revision planner", "Mock tests & PYQ packs", "AI mistake analysis",
        "Personalized learning path (AI)", "Unlimited flashcard generator",
        "Battle Arena — compete with peers", "Parent monitoring dashboard",
        "Career guidance explorer", "Priority support",
    ]
    seed_rows = [
        (str(uuid.uuid4()), "monthly",   "1 Month", settings.PLAN_MONTHLY_AMOUNT,   30,  None,             1),
        (str(uuid.uuid4()), "quarterly", "3 Months", settings.PLAN_QUARTERLY_AMOUNT, 90,  "Best Value",    2),
        (str(uuid.uuid4()), "annual",    "1 Year",  settings.PLAN_ANNUAL_AMOUNT,    365, "Most Popular",  3),
    ]
    for plan_id, key, name, price_paise, days, badge, order in seed_rows:
        await conn.execute(
            text(
                "INSERT INTO plans (id, plan_key, name, price_paise, currency, duration_days, badge, "
                "description, features, limits, is_popular, is_active, sort_order) "
                "VALUES (:id, :key, :name, :price, 'INR', :days, :badge, NULL, :features, '{}', "
                ":popular, true, :order) ON CONFLICT (plan_key) DO NOTHING"
            ),
            {
                "id": plan_id, "key": key, "name": name, "price": price_paise, "days": days,
                "badge": badge, "features": json.dumps(all_features),
                "popular": badge == "Most Popular", "order": order,
            },
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        # Advisory lock (transaction-scoped — auto-released at commit/
        # rollback) serializes schema creation/migration/seeding across this
        # service's concurrent uvicorn workers on startup.
        await conn.execute(text("SELECT pg_advisory_xact_lock(991008)"))
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))

        # Add deactivated_at column if not yet present (tracks cancellation timestamp)
        await conn.execute(text(
            "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS "
            "deactivated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL"
        ))

        # Migrate Subscription.plan from the old fixed Postgres enum
        # (subscriptionplan) to a free-text VARCHAR referencing Plan.plan_key
        # — lets admins add/remove plan tiers without a schema change.
        # Idempotent: no-op once already converted.
        try:
            await conn.execute(text(
                "ALTER TABLE subscriptions ALTER COLUMN plan TYPE VARCHAR(50) USING plan::text"
            ))
        except Exception:
            pass

        # Cashfree columns on `payments` (replacing Razorpay as the gateway).
        for stmt in [
            "ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway VARCHAR(20) NOT NULL DEFAULT 'cashfree'",
            "ALTER TABLE payments ADD COLUMN IF NOT EXISTS cashfree_order_id VARCHAR(100)",
            "ALTER TABLE payments ADD COLUMN IF NOT EXISTS cashfree_payment_id VARCHAR(100)",
            "ALTER TABLE payments ADD COLUMN IF NOT EXISTS cashfree_cf_order_id VARCHAR(100)",
            "ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan_key VARCHAR(50)",
            "CREATE INDEX IF NOT EXISTS ix_payments_cashfree_order_id ON payments (cashfree_order_id)",
            "CREATE INDEX IF NOT EXISTS ix_payments_cashfree_payment_id ON payments (cashfree_payment_id)",
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass

        # Razorpay is fully removed — drop its legacy columns rather than
        # keeping them around unused.
        for stmt in [
            "ALTER TABLE payments DROP COLUMN IF EXISTS razorpay_order_id",
            "ALTER TABLE payments DROP COLUMN IF EXISTS razorpay_payment_id",
            "ALTER TABLE payments DROP COLUMN IF EXISTS razorpay_signature",
            "ALTER TABLE subscriptions DROP COLUMN IF EXISTS razorpay_subscription_id",
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass

        await _seed_default_plans(conn)
    yield
    await engine.dispose()

if settings.SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENV,
        release=settings.APP_NAME,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

app = FastAPI(title=settings.APP_NAME, lifespan=lifespan, docs_url="/docs" if settings.DEBUG else None, redoc_url=None)
Instrumentator(should_group_status_codes=False, should_ignore_untemplated=True).instrument(app).expose(app, include_in_schema=False, tags=["observability"])
add_cors(app)
register_error_handlers(app)
app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.APP_NAME}
