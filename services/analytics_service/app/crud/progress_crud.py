import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import activity_crud
from app.models.student_progress import StudentProgress
from app.schemas.progress import (
    RecordProgressEventRequest,
    UpdateProgressRequest,
)


async def record_progress_event(db: AsyncSession, data: RecordProgressEventRequest) -> None:
    """Additive progress signal — safe for content_service and quiz_service to
    call independently for the same (user_id, chapter_id) row, each only
    touching the counters it owns (see RecordProgressEventRequest docstring).

    The running-average math below has to read-then-write the row (it can't
    be a single ON CONFLICT DO UPDATE expression the way upsert_progress()
    below is), so instead the whole read-modify-write is serialized per
    (user_id, chapter_id) with a transaction-scoped Postgres advisory lock —
    concurrent calls for the SAME row now queue instead of racing a
    SELECT-then-INSERT (which previously could create duplicate rows; see
    upsert_progress()'s docstring for the reproduction). hashtextextended()
    folds the two UUIDs into the single bigint key pg_advisory_xact_lock expects;
    concurrent calls for DIFFERENT rows hash to different keys and don't
    block each other."""
    lock_key = func.hashtextextended(f"{data.user_id}:{data.chapter_id}", 0)
    await db.execute(select(func.pg_advisory_xact_lock(lock_key)))

    result = await db.execute(
        select(StudentProgress).where(
            StudentProgress.user_id == data.user_id,
            StudentProgress.chapter_id == data.chapter_id,
        )
    )
    progress = result.scalar_one_or_none()
    if not progress:
        progress = StudentProgress(
            user_id=data.user_id, subject_id=data.subject_id, chapter_id=data.chapter_id,
            videos_watched=0, quizzes_completed=0, avg_quiz_score=0.0, completion_percentage=0.0,
        )
        db.add(progress)

    if data.video_completed:
        progress.videos_watched += 1

    if data.quiz_score is not None:
        # Running average across quiz completions on this chapter.
        prior_total = progress.avg_quiz_score * progress.quizzes_completed
        progress.quizzes_completed += 1
        progress.avg_quiz_score = (prior_total + data.quiz_score) / progress.quizzes_completed
        await activity_crud.log_quiz_attempt(db, data.user_id, data.quiz_score, data.subject_id)

    if data.completion_percentage is not None:
        progress.completion_percentage = data.completion_percentage

    await db.commit()


async def upsert_progress(db: AsyncSession, data: UpdateProgressRequest) -> None:
    """Insert or update a StudentProgress row for the given user + chapter.

    Atomic INSERT ... ON CONFLICT, not SELECT-then-INSERT — this runs from an
    unguarded FastAPI BackgroundTask (no client-visible failure path), and a
    SELECT-then-INSERT here previously let concurrent calls for the same
    (user_id, chapter_id) both miss the SELECT and both INSERT, creating
    duplicate rows (reproduced live: 10 concurrent requests -> 2 rows)."""
    stmt = insert(StudentProgress).values(
        id=uuid.uuid4(),
        user_id=data.user_id,
        subject_id=data.subject_id,
        chapter_id=data.chapter_id,
        videos_watched=data.videos_watched,
        quizzes_completed=data.quizzes_completed,
        avg_quiz_score=data.avg_quiz_score,
        completion_percentage=data.completion_percentage,
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_student_progress_user_chapter",
        set_={
            "videos_watched": stmt.excluded.videos_watched,
            "quizzes_completed": stmt.excluded.quizzes_completed,
            "avg_quiz_score": stmt.excluded.avg_quiz_score,
            "completion_percentage": stmt.excluded.completion_percentage,
        },
    )
    await db.execute(stmt)
    await db.commit()


async def get_student_progress(db: AsyncSession, user_id: uuid.UUID) -> list[StudentProgress]:
    """Return all StudentProgress rows for the given user."""
    result = await db.execute(
        select(StudentProgress).where(StudentProgress.user_id == user_id)
    )
    return list(result.scalars().all())


async def get_progress_rows_for_users(
    db: AsyncSession, user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[StudentProgress]]:
    """Batched form of get_student_progress for N students in one query — backs
    the parent multi-child summary (a parent with several linked children
    would otherwise cost one round-trip per child)."""
    if not user_ids:
        return {}
    result = await db.execute(
        select(StudentProgress).where(StudentProgress.user_id.in_(user_ids))
    )
    by_user: dict[uuid.UUID, list[StudentProgress]] = {uid: [] for uid in user_ids}
    for row in result.scalars().all():
        by_user.setdefault(row.user_id, []).append(row)
    return by_user
