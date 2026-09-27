from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import text

from app.routes.router import api_router
from app.core.config import settings
from app.core.redis import close_redis, get_redis
from app.database.base import Base
from app.database.session import engine
from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers
from app.models import daily_activity as _daily_activity_models  # noqa: F401 — registers tables for create_all
from app.models import revision_session as _revision_session_models  # noqa: F401 — registers tables for create_all


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        # Advisory lock (transaction-scoped — auto-released at commit/
        # rollback) serializes schema creation across this service's
        # concurrent uvicorn workers on startup.
        await conn.execute(text("SELECT pg_advisory_xact_lock(991010)"))
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
        # create_all() only creates missing TABLES, never alters an existing
        # one — student_progress predates this constraint, so it needs a
        # one-time, idempotent ADD CONSTRAINT here. Postgres has no native
        # "ADD CONSTRAINT IF NOT EXISTS"; a UNIQUE constraint is backed by an
        # index, and re-adding one that already exists raises
        # duplicate_table (not duplicate_object, despite ADD CONSTRAINT
        # being the statement) — catch both.
        await conn.execute(text("""
            DO $$
            BEGIN
                ALTER TABLE student_progress
                    ADD CONSTRAINT uq_student_progress_user_chapter UNIQUE (user_id, chapter_id);
            EXCEPTION
                WHEN duplicate_object OR duplicate_table THEN NULL;
            END $$;
        """))
        await conn.execute(text("""
            DO $$
            BEGIN
                ALTER TABLE weak_topic_analysis
                    ADD CONSTRAINT uq_weak_topic_analysis_user_topic UNIQUE (user_id, topic_id);
            EXCEPTION
                WHEN duplicate_object OR duplicate_table THEN NULL;
            END $$;
        """))
    await get_redis()
    yield
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
