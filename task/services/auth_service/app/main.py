import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, text

from app.routes.router import api_router
from app.core.config import settings
from app.core.redis import close_redis
from app.core.security import hash_password
from app.database.session import AsyncSessionLocal, engine
from app.database.base import Base
from app.models.audit_log import AuditLog  # noqa: F401 — registers table with Base.metadata
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block (and, even
    # on PG12+, not in the same transaction that goes on to use the new value)
    # — run it standalone, in autocommit, before anything else touches the
    # users.role enum. Adds the "pending" role used by new phone-OTP
    # signups until they pick student/parent (see routes/phone_otp.py).
    autocommit_conn = await engine.connect()
    try:
        await autocommit_conn.execution_options(isolation_level="AUTOCOMMIT")
        # SQLAlchemy's Enum(UserRole) stores the Python member NAME by
        # default (e.g. "STUDENT"), not the .value ("student") — every
        # existing label in this type is uppercase, so the new one must
        # match that convention or every read/write of PENDING rows breaks.
        await autocommit_conn.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'PENDING'"))
    except Exception:
        pass
    finally:
        await autocommit_conn.close()

    async with engine.begin() as conn:
        # Advisory lock (transaction-scoped — auto-released at commit/rollback,
        # so it can never leak) serializes schema creation/migration across
        # this service's concurrent uvicorn workers on startup.
        await conn.execute(func.pg_advisory_xact_lock(991002).select())
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
        # Idempotent migrations for new columns on existing tables
        for stmt in [
            # users — columns that may be missing from old schema
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS school_name VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false",
            "ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL",
            # Phone-OTP login: a phone-only account has no email until they
            # optionally add one later (see PhoneOTP / /auth/otp/* routes).
            "ALTER TABLE users ALTER COLUMN email DROP NOT NULL",
            # unique indexes — idempotent
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone ON users (phone) WHERE phone IS NOT NULL",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id) WHERE google_id IS NOT NULL",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_facebook_id ON users (facebook_id) WHERE facebook_id IS NOT NULL",
            # refresh_tokens
            "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)",
            "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_session_id ON refresh_tokens (session_id)",
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass
    # Seed default admin user if none exists (idempotent, race-safe)
    async with AsyncSessionLocal() as session:
        try:
            existing = await session.execute(
                text("SELECT id FROM users WHERE email = :email"),
                {"email": settings.ADMIN_EMAIL},
            )
            if not existing.scalar_one_or_none():
                await session.execute(
                    text("""
                        INSERT INTO users (id, email, hashed_password, role, is_active, is_verified, terms_accepted)
                        VALUES (:id, :email, :pw, 'ADMIN', true, true, true)
                        ON CONFLICT (email) DO NOTHING
                    """),
                    {"id": str(uuid.uuid4()), "email": settings.ADMIN_EMAIL, "pw": hash_password(settings.ADMIN_PASSWORD)},
                )
                await session.commit()
        except Exception as e:
            await session.rollback()
            logger.warning("Admin seed skipped: %s", e)

    # Prune stale rows so the tables don't grow unbounded across restarts
    async with AsyncSessionLocal() as _s:
        try:
            await _s.execute(text(
                "DELETE FROM refresh_tokens WHERE is_revoked = true OR expires_at < NOW()"
            ))
            await _s.execute(text(
                "DELETE FROM device_sessions WHERE is_active = false OR last_seen < NOW() - INTERVAL '30 days'"
            ))
            await _s.execute(text(
                "DELETE FROM password_resets WHERE is_used = true OR expires_at < NOW()"
            ))
            await _s.commit()
        except Exception:
            await _s.rollback()

    yield
    await close_redis()
    await engine.dispose()


logger = logging.getLogger(__name__)

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

app.add_middleware(RateLimitMiddleware, requests_per_minute=settings.AUTH_RATE_LIMIT * 6)

# ─── Centralized, consistent error handling (422 validation + 500 fallback) ──
# auth_service-specific field names not already covered by shared.errors.FIELD_LABELS.
register_error_handlers(
    app,
    extra_field_labels={
        "token": "Token",
        "new_password": "New password",
        "refresh_token": "Refresh token",
    },
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.APP_NAME}
