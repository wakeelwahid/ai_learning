import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attempt import QuizAnswer, QuizAttempt
from app.models.quiz_definition import Question, Quiz


async def get_attempt(db: AsyncSession, attempt_id: uuid.UUID) -> QuizAttempt | None:
    return await db.get(QuizAttempt, attempt_id)


async def get_user_attempts(db: AsyncSession, user_id: uuid.UUID, limit: int = 20) -> list[QuizAttempt]:
    """All quiz attempts for a user, most recent first.

    IDOR fix: the caller always passes their own JWT-derived id here (see
    routes/attempts.py::get_user_attempts) — the {user_id} path param is never
    used for filtering.
    """
    result = await db.execute(
        select(QuizAttempt)
        .where(QuizAttempt.user_id == user_id)
        .order_by(QuizAttempt.started_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def has_completed_any_quiz(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """True if this user has at least one attempt with status="completed".

    Used by the internal /attempts/internal/completed/{user_id} route (see
    routes/attempts.py) — referral_service's server-side qualification check
    calls this instead of trusting a client-asserted "quiz_completed" flag.
    """
    result = await db.execute(
        select(QuizAttempt.id)
        .where(QuizAttempt.user_id == user_id, QuizAttempt.status == "completed")
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def has_completed_specific_quiz(db: AsyncSession, user_id: uuid.UUID, quiz_id: uuid.UUID) -> bool:
    """True if this user has a completed attempt on THIS specific quiz.

    Used by the internal /attempts/internal/completed/{user_id}/{quiz_id}
    route — gamification_service's Challenge Programs feature calls this to
    verify a quiz/practice-type challenge task server-side."""
    result = await db.execute(
        select(QuizAttempt.id)
        .where(
            QuizAttempt.user_id == user_id,
            QuizAttempt.quiz_id == quiz_id,
            QuizAttempt.status == "completed",
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_attempt_answer_counts(db: AsyncSession, attempt_id: uuid.UUID, quiz_id: uuid.UUID) -> tuple[int, int]:
    """Return (answered, unanswered) counts for an attempt.

    answered = QuizAnswer rows with a non-null user_answer.
    unanswered = the quiz's real total question count minus answered — NOT
    total QuizAnswer rows minus answered, since a question the student never
    opened at all has no QuizAnswer row and would otherwise be invisible to
    this count (same fix already applied in quiz_service.py's submit_quiz()).
    """
    answered = await db.scalar(
        select(func.count()).where(
            QuizAnswer.attempt_id == attempt_id,
            QuizAnswer.user_answer.isnot(None),
        )
    ) or 0
    total_questions = await db.scalar(
        select(func.count()).where(Question.quiz_id == quiz_id)
    ) or 0
    unanswered = total_questions - answered
    return answered, unanswered


# ── Internal student-activity reads (parent RAG) ─────────────────────────────
#
# All three are scoped to completed attempts within the last `days`, so the
# caller gets one consistent window across attempts, per-subject rollups and
# totals.

def _completed_since(user_id: uuid.UUID, days: int):
    """WHERE clause shared by the three student-activity queries."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return (
        QuizAttempt.user_id == user_id,
        QuizAttempt.status == "completed",
        QuizAttempt.completed_at >= cutoff,
    )


async def get_completed_attempts_with_quiz(
    db: AsyncSession, user_id: uuid.UUID, days: int, limit: int
) -> list[tuple[QuizAttempt, Quiz]]:
    """Most recent completed attempts joined to their Quiz for subject/chapter
    labels. Used by the internal /internal/student/{user_id}/attempts route."""
    result = await db.execute(
        select(QuizAttempt, Quiz)
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .where(*_completed_since(user_id, days))
        .order_by(QuizAttempt.completed_at.desc())
        .limit(limit)
    )
    return result.all()


async def get_answer_counts_by_attempt(
    db: AsyncSession, attempt_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[int, int]]:
    """Map attempt_id → (correct_count, wrong_count) for many attempts in ONE
    grouped query — never loop this per attempt."""
    if not attempt_ids:
        return {}
    correct = func.count().filter(QuizAnswer.is_correct.is_(True))
    wrong = func.count().filter(QuizAnswer.is_correct.is_(False))
    result = await db.execute(
        select(QuizAnswer.attempt_id, correct, wrong)
        .where(QuizAnswer.attempt_id.in_(attempt_ids))
        .group_by(QuizAnswer.attempt_id)
    )
    return {row[0]: (row[1], row[2]) for row in result.all()}


async def get_subject_stats(db: AsyncSession, user_id: uuid.UUID, days: int) -> list[tuple]:
    """Per-subject rollup of completed attempts: (subject_name, attempts,
    avg_percentage, best_percentage, worst_percentage)."""
    result = await db.execute(
        select(
            Quiz.subject_name,
            func.count(QuizAttempt.id),
            func.avg(QuizAttempt.percentage),
            func.max(QuizAttempt.percentage),
            func.min(QuizAttempt.percentage),
        )
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .where(*_completed_since(user_id, days), Quiz.subject_name.isnot(None))
        .group_by(Quiz.subject_name)
        .order_by(func.count(QuizAttempt.id).desc())
    )
    return result.all()


async def get_attempt_totals(db: AsyncSession, user_id: uuid.UUID, days: int) -> tuple:
    """Overall rollup: (attempts, avg_percentage, total_time_seconds,
    first_attempt_at, last_attempt_at). Zeros/None when the user has no data."""
    result = await db.execute(
        select(
            func.count(QuizAttempt.id),
            func.avg(QuizAttempt.percentage),
            func.sum(QuizAttempt.time_taken_seconds),
            func.min(QuizAttempt.completed_at),
            func.max(QuizAttempt.completed_at),
        ).where(*_completed_since(user_id, days))
    )
    return result.one()
