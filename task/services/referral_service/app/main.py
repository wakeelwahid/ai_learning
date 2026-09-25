from contextlib import asynccontextmanager
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, text
from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers
from app.routes.router import api_router
from app.core.config import settings
from app.database.session import engine
from app.database.base import Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        # Advisory lock (transaction-scoped — auto-released at commit/
        # rollback, so it can never leak) serializes schema creation across
        # this service's concurrent uvicorn workers. Was previously
        # unguarded (the only one of 12 services with no race protection at
        # all around create_all()), so two workers racing on an empty DB
        # could crash on startup.
        await conn.execute(func.pg_advisory_xact_lock(991001).select())
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
        # Idempotent migration for existing deployments — create_all() only
        # creates brand-new tables, it never alters an existing referrals
        # table to add a column the model has grown since.
        await conn.execute(text(
            "ALTER TABLE referrals ADD COLUMN IF NOT EXISTS "
            "friend_reward_claimed BOOLEAN NOT NULL DEFAULT false"
        ))
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
