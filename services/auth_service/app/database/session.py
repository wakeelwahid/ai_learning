from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import event, text

from app.core.config import settings

# Phase 1: pool_size reduced from 20→5 per service.
# Each service connects directly to its own dedicated Postgres container —
# there is no PgBouncer (or any shared Postgres) in this deployment's actual
# request path; infra/docker-compose.yml defines a pgbouncer service but no
# service's DATABASE_URL points at it. Pool sizing here is bounded purely
# against this service's own Postgres container's max_connections.
engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args={"prepared_statement_cache_size": 0},
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    pool_timeout=30,
    pool_recycle=1800,   # recycle connections every 30 min to prevent stale connections
    echo=settings.DEBUG,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
