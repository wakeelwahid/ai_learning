"""CRUD for the multi-day Challenge Programs feature."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.challenge_program import (
    ChallengeDay,
    ChallengeProgram,
    ChallengeProgramStatus,
    ChallengeTask,
    UserChallengeEnrollment,
    UserChallengeTaskProgress,
)


# ── Program ──────────────────────────────────────────────────────────────────

async def get_program(db: AsyncSession, program_id: uuid.UUID) -> ChallengeProgram | None:
    return await db.get(ChallengeProgram, program_id)


async def list_programs_admin(db: AsyncSession, limit: int = 100, offset: int = 0) -> list[ChallengeProgram]:
    result = await db.execute(
        select(ChallengeProgram).order_by(ChallengeProgram.created_at.desc()).offset(offset).limit(limit)
    )
    return list(result.scalars().all())


async def list_published_programs(db: AsyncSession, limit: int = 50, offset: int = 0) -> list[ChallengeProgram]:
    result = await db.execute(
        select(ChallengeProgram)
        .where(ChallengeProgram.status == ChallengeProgramStatus.PUBLISHED)
        .order_by(ChallengeProgram.published_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_participant_count(db: AsyncSession, program_id: uuid.UUID) -> int:
    return await db.scalar(
        select(func.count(UserChallengeEnrollment.id)).where(UserChallengeEnrollment.program_id == program_id)
    ) or 0


# ── Days ─────────────────────────────────────────────────────────────────────

async def get_day(db: AsyncSession, day_id: uuid.UUID) -> ChallengeDay | None:
    return await db.get(ChallengeDay, day_id)


async def get_days(db: AsyncSession, day_ids: list[uuid.UUID]) -> list[ChallengeDay]:
    """Batched form of get_day — one query for a list of day ids instead of
    one per id."""
    if not day_ids:
        return []
    result = await db.execute(select(ChallengeDay).where(ChallengeDay.id.in_(day_ids)))
    return list(result.scalars().all())


async def get_days_for_program(db: AsyncSession, program_id: uuid.UUID) -> list[ChallengeDay]:
    result = await db.execute(
        select(ChallengeDay).where(ChallengeDay.program_id == program_id).order_by(ChallengeDay.day_number)
    )
    return list(result.scalars().all())


# ── Tasks ────────────────────────────────────────────────────────────────────

async def get_task(db: AsyncSession, task_id: uuid.UUID) -> ChallengeTask | None:
    return await db.get(ChallengeTask, task_id)


async def get_tasks_for_day(db: AsyncSession, day_id: uuid.UUID) -> list[ChallengeTask]:
    result = await db.execute(
        select(ChallengeTask).where(ChallengeTask.day_id == day_id).order_by(ChallengeTask.sequence)
    )
    return list(result.scalars().all())


async def get_tasks_for_days(db: AsyncSession, day_ids: list[uuid.UUID]) -> list[ChallengeTask]:
    if not day_ids:
        return []
    result = await db.execute(
        select(ChallengeTask).where(ChallengeTask.day_id.in_(day_ids)).order_by(ChallengeTask.sequence)
    )
    return list(result.scalars().all())


async def find_tasks_by_content_ref(
    db: AsyncSession, content_ref: str, task_types: list | None = None,
) -> list[ChallengeTask]:
    """All ChallengeTask rows referencing this content item — a single
    video/quiz/battle can appear in multiple challenge programs (or
    multiple days of the same program), so this can return several rows."""
    stmt = select(ChallengeTask).where(ChallengeTask.content_ref == content_ref)
    if task_types:
        stmt = stmt.where(ChallengeTask.task_type.in_(task_types))
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ── Enrollment ───────────────────────────────────────────────────────────────

async def get_enrollment(db: AsyncSession, user_id: uuid.UUID, program_id: uuid.UUID) -> UserChallengeEnrollment | None:
    result = await db.execute(
        select(UserChallengeEnrollment).where(
            UserChallengeEnrollment.user_id == user_id,
            UserChallengeEnrollment.program_id == program_id,
        )
    )
    return result.scalar_one_or_none()


async def get_enrollments_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[UserChallengeEnrollment]:
    result = await db.execute(
        select(UserChallengeEnrollment)
        .where(UserChallengeEnrollment.user_id == user_id)
        .order_by(UserChallengeEnrollment.joined_at.desc())
    )
    return list(result.scalars().all())


async def get_enrollments_for_program(db: AsyncSession, program_id: uuid.UUID) -> list[UserChallengeEnrollment]:
    result = await db.execute(
        select(UserChallengeEnrollment).where(UserChallengeEnrollment.program_id == program_id)
    )
    return list(result.scalars().all())


async def find_active_enrollments_for_task_content(
    db: AsyncSession, user_id: uuid.UUID, program_ids: list[uuid.UUID],
) -> list[UserChallengeEnrollment]:
    """Active enrollments this user has in any of the given programs — used
    to scope task-progress resolution to programs the user is actually
    enrolled in (a task matching by content_ref alone could otherwise
    belong to a program the user never joined)."""
    if not program_ids:
        return []
    result = await db.execute(
        select(UserChallengeEnrollment).where(
            UserChallengeEnrollment.user_id == user_id,
            UserChallengeEnrollment.program_id.in_(program_ids),
        )
    )
    return list(result.scalars().all())


# ── Task progress ────────────────────────────────────────────────────────────

async def get_task_progress(db: AsyncSession, user_id: uuid.UUID, task_id: uuid.UUID) -> UserChallengeTaskProgress | None:
    result = await db.execute(
        select(UserChallengeTaskProgress).where(
            UserChallengeTaskProgress.user_id == user_id,
            UserChallengeTaskProgress.task_id == task_id,
        )
    )
    return result.scalar_one_or_none()


async def get_task_progress_for_tasks(
    db: AsyncSession, user_id: uuid.UUID, task_ids: list[uuid.UUID],
) -> list[UserChallengeTaskProgress]:
    if not task_ids:
        return []
    result = await db.execute(
        select(UserChallengeTaskProgress).where(
            UserChallengeTaskProgress.user_id == user_id,
            UserChallengeTaskProgress.task_id.in_(task_ids),
        )
    )
    return list(result.scalars().all())
