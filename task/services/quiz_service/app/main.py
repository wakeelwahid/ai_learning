import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, text

from app.routes.router import api_router
from app.core.config import settings
from app.core.redis import close_redis, get_redis
from app.database.base import Base
from app.database.session import engine
from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers
from app.workers.event_consumer import start_consumer

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    # Create new tables; apply schema migrations for new columns
    async with engine.begin() as conn:
        # Advisory lock (transaction-scoped — auto-released at commit/
        # rollback) serializes schema creation/migration across this
        # service's concurrent uvicorn workers on startup.
        await conn.execute(func.pg_advisory_xact_lock(991005).select())
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
        await conn.execute(text("""
            ALTER TABLE quizzes
                ADD COLUMN IF NOT EXISTS board        VARCHAR(50),
                ADD COLUMN IF NOT EXISTS class_num    INTEGER,
                ADD COLUMN IF NOT EXISTS subject_name VARCHAR(100),
                ADD COLUMN IF NOT EXISTS chapter_name VARCHAR(200)
        """))

    # Warm up Redis connection
    await get_redis()
    logger.info("Redis connection established")

    # Start RabbitMQ cache-rebuild consumer in background
    consumer_task: asyncio.Task | None = None
    try:
        consumer_task = asyncio.create_task(start_consumer())
        logger.info("Quiz cache consumer task started")
    except Exception as exc:
        logger.warning("Could not start cache consumer: %s", exc)

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────────
    if consumer_task:
        consumer_task.cancel()
        try:
            await consumer_task
        except (asyncio.CancelledError, Exception):
            pass

    await close_redis()
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

app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
)

Instrumentator(
    should_group_status_codes=False,
    should_ignore_untemplated=True,
).instrument(app).expose(app, include_in_schema=False, tags=["observability"])

add_cors(app)
register_error_handlers(app)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.APP_NAME}
