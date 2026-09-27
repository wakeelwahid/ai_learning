import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

# Celery workers spawn a fresh asyncio.run() per task — pooled asyncpg connections
# from a prior loop raise "got Future attached to a different loop". Set
# CELERY_WORKER=true in the celery container to keep NullPool there.
# The FastAPI web server runs in a single long-lived loop, so a bounded pool is safe
# and prevents unbounded connection growth (~1 new PG conn per AI request with NullPool).
is_celery = os.environ.get("CELERY_WORKER", "false").lower() == "true"

if is_celery:
    engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool)
else:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        connect_args={"statement_cache_size": 500},
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
        pool_recycle=1800,
    )

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
