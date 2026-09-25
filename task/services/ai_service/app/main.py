from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import text

from app.routes.router import api_router
from app.core.config import settings
from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers
from app.core.redis import get_redis
from app.database.base import Base
from app.database.session import engine
import app.models.ai_usage_log  # register AIUsageLog with Base metadata  # noqa: F401
import app.models.paper_attempt  # register PaperAttempt with Base metadata  # noqa: F401
import app.models.question_item  # register QuestionItem with Base metadata  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        # Advisory lock serialises schema creation across concurrent uvicorn workers
        await conn.execute(text("SELECT pg_advisory_lock(987654321)"))
        try:
            await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
            await conn.execute(
                text(
                    "ALTER TABLE ingestion_jobs "
                    "ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT 'syllabus',"
                    "ADD COLUMN IF NOT EXISTS collection  VARCHAR(100) DEFAULT 'school_subjects';"
                )
            )
        finally:
            await conn.execute(text("SELECT pg_advisory_unlock(987654321)"))
    redis = await get_redis()
    yield
    await redis.aclose()
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
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
    lifespan=lifespan,
)

add_cors(app)
register_error_handlers(app)

Instrumentator(
    should_group_status_codes=False,
    should_ignore_untemplated=True,
).instrument(app).expose(app, include_in_schema=False)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.APP_NAME}
