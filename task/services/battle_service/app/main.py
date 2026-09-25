import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, text

from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers
from app.core.config import settings
from app.core.redis_client import close_redis
from app.core.websocket_manager import manager
from app.database.session import engine
from app.database.base import Base
from app.routes.router import api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DB tables
    async with engine.begin() as conn:
        # Advisory lock (transaction-scoped — auto-released at commit/
        # rollback) serializes schema creation/migration across this
        # service's concurrent uvicorn workers on startup.
        await conn.execute(func.pg_advisory_xact_lock(991006).select())
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))

        # Idempotent column migrations (Battle Reminder / scheduled battles)
        try:
            await conn.execute(text("ALTER TABLE battles ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE"))
            await conn.execute(text("ALTER TABLE battles ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_battles_scheduled_at ON battles (scheduled_at)"))
        except Exception as exc:
            logger.warning("Battle Reminder column migration failed (non-fatal): %s", exc)
    logger.info("Battle Service ready — tables created")

    # Redis pub/sub listener for horizontal WebSocket scaling
    try:
        await manager.start_pubsub_listener()
        logger.info("Redis pub/sub listener started")
    except Exception as exc:
        logger.warning("Redis pub/sub listener not started (Redis may be unavailable): %s", exc)

    yield

    # Shutdown
    await engine.dispose()
    try:
        await close_redis()
        logger.info("Redis pool closed")
    except Exception as exc:
        logger.warning("Redis shutdown error: %s", exc)


if settings.SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        release="Battle Service",
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

app = FastAPI(
    title="Battle Service",
    version="1.0.0",
    lifespan=lifespan,
)

Instrumentator(should_group_status_codes=False, should_ignore_untemplated=True).instrument(app).expose(app, include_in_schema=False, tags=["observability"])

add_cors(app)
register_error_handlers(app)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "Battle Service"}
