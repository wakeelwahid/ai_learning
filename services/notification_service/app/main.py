import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import text
from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers
from app.routes.router import api_router
from app.models.push_token import PushToken  # noqa: F401
from app.models.announcement import Announcement  # noqa: F401 — registers table with Base.metadata
from app.models.maintenance import MaintenanceMode  # noqa: F401 — registers table with Base.metadata
from app.models.contact_message import ContactMessage  # noqa: F401 — registers table with Base.metadata
from app.core.config import settings
from app.database.session import engine, AsyncSessionLocal
from app.database.base import Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── DB schema bootstrap ────────────────────────────────────────────────
    async with engine.begin() as conn:
        # Advisory lock (transaction-scoped — auto-released at commit/
        # rollback) serializes schema creation across this service's
        # concurrent uvicorn workers on startup.
        await conn.execute(text("SELECT pg_advisory_xact_lock(991009)"))
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))

    # ── Idempotent column migrations (Morning/Afternoon/Night reminder prefs) ─
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(text(
                "ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS "
                "in_app_daily_goal_reminder BOOLEAN NOT NULL DEFAULT TRUE"
            ))
            await session.execute(text(
                "ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS "
                "in_app_friend_activity BOOLEAN NOT NULL DEFAULT TRUE"
            ))
            await session.execute(text(
                "ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS "
                "in_app_revision_reminder BOOLEAN NOT NULL DEFAULT TRUE"
            ))
            await session.execute(text(
                "ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS "
                "in_app_weak_topic_nudge BOOLEAN NOT NULL DEFAULT TRUE"
            ))
            await session.commit()
        except Exception:
            await session.rollback()

    # ── push_tokens: multi-device support ─────────────────────────────────
    # Was uniquely keyed on (user_id, platform), so a second device on the
    # same platform silently evicted the first device's token. Re-key on
    # (user_id, device_id) instead — see models/push_token.py's docstring.
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(text(
                "ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS device_id VARCHAR(200) NOT NULL DEFAULT ''"
            ))
            # Backfill: any pre-existing row (registered before this column
            # existed) gets its own row id as a synthetic device_id — unique
            # by construction, so it can never collide with a real one.
            await session.execute(text(
                "UPDATE push_tokens SET device_id = id::text WHERE device_id = ''"
            ))
            await session.execute(text(
                "ALTER TABLE push_tokens DROP CONSTRAINT IF EXISTS push_tokens_user_id_platform_key"
            ))
            # Plain ADD CONSTRAINT isn't idempotent (errors if it already
            # exists, unlike IF NOT EXISTS on a column) — this service runs
            # 4 uvicorn workers that all race through this block on startup,
            # so guard it explicitly rather than relying on the per-worker
            # transaction rollback to paper over the race.
            exists = await session.execute(text(
                "SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_user_id_device_id_key'"
            ))
            if exists.scalar() is None:
                await session.execute(text(
                    "ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_user_id_device_id_key "
                    "UNIQUE (user_id, device_id)"
                ))
            await session.commit()
        except Exception:
            await session.rollback()

    # NOTE: APScheduler is intentionally NOT started here. This app runs 4
    # uvicorn workers (see Dockerfile) for HTTP throughput; APScheduler has no
    # leader election, so starting it per-worker would fire every cron/interval
    # job 4x. The single scheduler instance lives in its own process instead —
    # see app/scheduler_main.py and the `notification_scheduler` container in
    # docker-compose.yml.

    yield

    # ── DB engine teardown ─────────────────────────────────────────────────
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
app.include_router(api_router)

@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.APP_NAME}
