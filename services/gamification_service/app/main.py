import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import select, func, text
from app.routes.router import api_router
from app.core.config import settings
from app.database.session import engine, AsyncSessionLocal
from app.database.base import Base
from app.middleware.cors import add_cors
from app.middleware.error_handlers import register_error_handlers
from app.models.gamification import GoalTemplate, GoalType, GoalDifficulty
from app.models.challenge_program import (  # noqa: F401 — registers tables with Base.metadata
    ChallengeProgram, ChallengeDay, ChallengeTask,
    UserChallengeEnrollment, UserChallengeTaskProgress,
)

logger = logging.getLogger(__name__)

CREATE_LEADERBOARD_MV = """
CREATE MATERIALIZED VIEW IF NOT EXISTS leaderboard_mv AS
SELECT
    user_id,
    total_xp,
    level,
    RANK() OVER (ORDER BY total_xp DESC) AS rank
FROM user_xp
WITH DATA;
"""

CREATE_LEADERBOARD_MV_IDX = """
CREATE UNIQUE INDEX IF NOT EXISTS ix_leaderboard_mv_user_id ON leaderboard_mv (user_id);
"""


async def refresh_leaderboard_mv_loop() -> None:
    """Refresh leaderboard_mv every 5 minutes — CONCURRENTLY to avoid read locks."""
    while True:
        await asyncio.sleep(300)
        try:
            async with AsyncSessionLocal() as session:
                await session.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_mv"))
                await session.commit()
        except Exception as exc:
            logger.warning("leaderboard_mv refresh failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block (and, even
    # on PG12+, not in the same transaction that goes on to use the new value)
    # — run it standalone, in autocommit, before anything else touches the
    # xpevent enum. Adds the two Challenge Program XP events — create_all()
    # only creates brand-new tables/types, it never alters an existing
    # Postgres enum type to add values a later model change introduced.
    autocommit_conn = await engine.connect()
    try:
        await autocommit_conn.execution_options(isolation_level="AUTOCOMMIT")
        await autocommit_conn.execute(text("ALTER TYPE xpevent ADD VALUE IF NOT EXISTS 'CHALLENGE_TASK_COMPLETE'"))
        await autocommit_conn.execute(text("ALTER TYPE xpevent ADD VALUE IF NOT EXISTS 'CHALLENGE_PROGRAM_COMPLETE'"))
        await autocommit_conn.execute(text("ALTER TYPE badgetype ADD VALUE IF NOT EXISTS 'CHALLENGE_COMPLETE'"))
    except Exception as exc:
        logger.warning("xpevent enum migration failed (non-fatal): %s", exc)
    finally:
        await autocommit_conn.close()

    try:
        async with engine.begin() as conn:
            # Advisory lock (transaction-scoped — auto-released at commit/
            # rollback) serializes schema creation across this service's
            # concurrent uvicorn workers on startup, closing the race the
            # except below used to just paper over.
            await conn.execute(text("SELECT pg_advisory_xact_lock(991007)"))
            await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
    except Exception:
        # Kept as a defensive fallback; the advisory lock above should make
        # this unreachable in normal operation.
        pass
    # Idempotent column migrations for tables that may predate schema changes
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(text("ALTER TABLE user_xp ADD COLUMN IF NOT EXISTS season_start TIMESTAMP WITH TIME ZONE"))
            # Streak Freeze columns (added with the traffic-growth feature set).
            # DEFAULT 0 NOT NULL backfills any legacy user_streaks rows so the
            # StreakFreezeService never reads NULL.
            await session.execute(text("ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS freeze_count INTEGER NOT NULL DEFAULT 0"))
            await session.execute(text("ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS freeze_used_date DATE"))
            # Backs the /rank-unlock COUNT(*) query — without it, every rank
            # lookup is a full sequential scan of user_xp, which doesn't hold
            # up at 6k+ concurrent users hitting the leaderboard screen.
            await session.execute(text("CREATE INDEX IF NOT EXISTS ix_user_xp_total_xp ON user_xp (total_xp DESC)"))
            await session.commit()
        except Exception:
            await session.rollback()
    # Phase 12 security fix: dedup backstop on (user_id, event, reference_id)
    # so replaying the same award request can never double-credit
    # XP/EduPoints — see GamificationService._apply_xp_amount /
    # EduPointsService.award. Partial index so NULL reference_id (events with
    # no natural reference) and, for EduPoints, NULL event (spend rows) are
    # never constrained.
    #
    # Each index is created in its own transaction: pre-existing duplicate
    # rows in one table (which CREATE UNIQUE INDEX refuses to index over)
    # must not abort the other table's index creation, and any failure here
    # is logged as an error — this is a DB-level integrity backstop, not
    # something that should fail silently.
    # QBG-013: daily-reward reference_id was keyed off the cyclic
    # day-in-cycle, not the calendar claim_date, so it collided across a
    # user's lifetime once they completed 2+ streak cycles. That's fixed at
    # the call site (see GamificationService.claim), but 7 pre-fix rows
    # legitimately collide under the old scheme and must never be
    # deleted/modified — see alembic/versions/fix_daily_reward_dedup_cutover.py
    # for the full writeup. These indexes are therefore scoped to rows
    # created at/after that same cutover so historical rows are grandfathered
    # out of the constraint while every future row is fully protected.
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_xp_txn_user_event_ref "
                "ON xp_transactions (user_id, event, reference_id) "
                "WHERE reference_id IS NOT NULL AND created_at >= '2026-09-18T00:00:00+00:00'"
            ))
            await session.commit()
        except Exception as exc:
            await session.rollback()
            logger.error(
                "Failed to create uq_xp_txn_user_event_ref dedup index — "
                "duplicate (user_id, event, reference_id) rows likely "
                "pre-exist in xp_transactions at/after the dedup cutover and "
                "must be resolved before this DB-level dedup backstop can be "
                "established: %s", exc
            )
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_ep_txn_user_event_ref "
                "ON edupoint_transactions (user_id, event, reference_id) "
                "WHERE event IS NOT NULL AND reference_id IS NOT NULL "
                "AND created_at >= '2026-09-18T00:00:00+00:00'"
            ))
            await session.commit()
        except Exception as exc:
            await session.rollback()
            logger.error(
                "Failed to create uq_ep_txn_user_event_ref dedup index — "
                "duplicate (user_id, event, reference_id) rows likely "
                "pre-exist in edupoint_transactions at/after the dedup "
                "cutover and must be resolved before this DB-level dedup "
                "backstop can be established: %s", exc
            )
    # Phase 20: Materialized view for leaderboard (500ms → 10ms at scale)
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(text(CREATE_LEADERBOARD_MV))
            await session.execute(text(CREATE_LEADERBOARD_MV_IDX))
            await session.commit()
        except Exception:
            await session.rollback()

    # Seed default Goal Templates on first boot so the Daily Goal System
    # works out of the box — admin can edit/add/disable these afterward via
    # /gamification/goals/admin/templates with no deploy required.
    #
    # This service runs 4 uvicorn workers that each execute this lifespan
    # independently on cold boot — an advisory lock (held for the rest of
    # this transaction) serializes the check-then-insert across all of them,
    # so only the first worker to acquire it actually seeds.
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(text("SELECT pg_advisory_xact_lock(872341)"))
            count = await session.scalar(select(func.count()).select_from(GoalTemplate))
            if not count:
                session.add_all([
                    GoalTemplate(goal_type=GoalType.QUESTIONS, title_template="Complete {count} Questions",
                                 target_count=5, xp_reward=15, ep_reward=3, difficulty=GoalDifficulty.EASY),
                    GoalTemplate(goal_type=GoalType.QUIZ, title_template="Complete {count} Quiz",
                                 target_count=1, xp_reward=25, ep_reward=5, difficulty=GoalDifficulty.MEDIUM),
                    GoalTemplate(goal_type=GoalType.VIDEO, title_template="Watch {count} Videos",
                                 target_count=2, xp_reward=15, ep_reward=3, difficulty=GoalDifficulty.EASY),
                    GoalTemplate(goal_type=GoalType.PRACTICE_MINUTES, title_template="Practice {count} Minutes",
                                 target_count=20, xp_reward=20, ep_reward=4, difficulty=GoalDifficulty.MEDIUM),
                ])
            await session.commit()
        except Exception:
            await session.rollback()
    refresh_task = asyncio.create_task(refresh_leaderboard_mv_loop())
    yield
    refresh_task.cancel()
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
