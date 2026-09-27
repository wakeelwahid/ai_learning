import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, text

from app.routes.router import api_router
from app.core.redis import get_redis, close_redis
from app.core.config import settings
from app.database.session import engine
from app.database.base import Base
# Import all models so SQLAlchemy metadata is populated before create_all
import app.models.content  # noqa: F401
from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers
from app.workers.progress_worker import run_flush_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        # Advisory lock (transaction-scoped — auto-released at commit/
        # rollback) serializes schema creation/migration across this
        # service's concurrent uvicorn workers on startup.
        await conn.execute(func.pg_advisory_xact_lock(991004).select())
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
        # Idempotent column additions for existing deployments
        await conn.execute(text(
            "ALTER TABLE videos ADD COLUMN IF NOT EXISTS notes_url VARCHAR(1024) DEFAULT NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE video_progress ADD COLUMN IF NOT EXISTS "
            "actual_watched_seconds INTEGER NOT NULL DEFAULT 0"
        ))

    # Warm up Redis connection pool
    try:
        await get_redis().ping()
    except Exception:
        pass  # Redis unavailable at startup — will retry on first request

    # Start background progress-flush worker (Redis → PostgreSQL every 45 s)
    flush_task = asyncio.create_task(run_flush_loop(), name="progress-flush-worker")

    yield

    # Graceful shutdown: cancel worker (triggers final flush inside run_flush_loop)
    flush_task.cancel()
    try:
        await flush_task
    except asyncio.CancelledError:
        pass

    await engine.dispose()
    await close_redis()


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
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
    lifespan=lifespan,
)

Instrumentator(should_group_status_codes=False, should_ignore_untemplated=True).instrument(app).expose(app, include_in_schema=False, tags=["observability"])

add_cors(app)
register_error_handlers(app)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.APP_NAME}
