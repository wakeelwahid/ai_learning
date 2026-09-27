import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, select

from app.core.config import settings
from app.database.session import engine, get_db_ctx
from app.database.base import Base
from app.models.career_catalog import Career
from app.models.career_goal import CareerGoal  # ensure model registered
from app.models.skill_assessment import SkillAssessment  # ensure model registered
from app.models.opportunity import Opportunity  # ensure model registered
from app.routes.router import api_router
from app.core.seed_data import CAREER_SEED_DATA
from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def seed_careers():
    """Seed career data on first startup if table is empty.

    The advisory lock (transaction-scoped — auto-released at commit/
    rollback) serializes this check-then-insert across this service's
    concurrent uvicorn workers: without it, two workers starting
    simultaneously against a fresh empty table could both pass the
    "not yet seeded" check before either commits, duplicating every row.
    """
    async with get_db_ctx() as db:
        await db.execute(func.pg_advisory_xact_lock(991011).select())
        count_res = await db.execute(select(Career).limit(1))
        if count_res.scalar_one_or_none() is not None:
            return  # already seeded

        logger.info("Seeding %d careers...", len(CAREER_SEED_DATA))
        for data in CAREER_SEED_DATA:
            career = Career(
                id=uuid.uuid4(),
                title=data["title"],
                category=data["category"],
                slug=data["slug"],
                overview=data["overview"],
                required_subjects=data["required_subjects"],
                skills_required=data["skills_required"],
                roadmap_steps=data["roadmap_steps"],
                salary_range=data["salary_range"],
                demand_level=data["demand_level"],
                top_colleges=data.get("top_colleges", []),
                entrance_exams=data.get("entrance_exams", []),
                future_demand=data.get("future_demand"),
                icon=data.get("icon"),
                color=data.get("color"),
                is_active=True,
            )
            db.add(career)
        await db.commit()
        logger.info("Career seeding complete.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            # Advisory lock (transaction-scoped — auto-released at commit/
            # rollback) serializes schema creation across this service's
            # concurrent uvicorn workers on startup.
            await conn.execute(func.pg_advisory_xact_lock(991012).select())
            await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
    except Exception:
        pass
    await seed_careers()
    logger.info("Career Service ready")
    yield
    await engine.dispose()


if settings.SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        release="Career Service",
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

app = FastAPI(
    title="Career Service",
    version="1.0.0",
    lifespan=lifespan,
)

Instrumentator(should_group_status_codes=False, should_ignore_untemplated=True).instrument(app).expose(app, include_in_schema=False, tags=["observability"])

add_cors(app)
register_error_handlers(app)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "Career Service"}
