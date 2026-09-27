import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.weak_topic import WeakTopicAnalysis
from app.schemas.weak_topic import RecordTopicAttemptRequest


async def upsert_topic_attempt(db: AsyncSession, data: RecordTopicAttemptRequest) -> None:
    """Insert or update a WeakTopicAnalysis row for the given user + topic.

    Serialized per (user_id, topic_id) with a transaction-scoped advisory
    lock — same fix and same reasoning as progress_crud.record_progress_event
    (the attempts/correct_answers/accuracy math needs the row's current
    state, so this can't be a single ON CONFLICT DO UPDATE the way a pure
    overwrite could be)."""
    lock_key = func.hashtextextended(f"{data.user_id}:{data.topic_id}", 0)
    await db.execute(select(func.pg_advisory_xact_lock(lock_key)))

    result = await db.execute(
        select(WeakTopicAnalysis).where(
            WeakTopicAnalysis.user_id == data.user_id,
            WeakTopicAnalysis.topic_id == data.topic_id,
        )
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        # Pass the counter defaults explicitly — mapped_column(default=0) only
        # applies server-side at flush/INSERT time, so without this the
        # in-memory attributes are None until the next flush and the `+=`
        # below raises TypeError on every student's first attempt at a topic.
        analysis = WeakTopicAnalysis(
            user_id=data.user_id, topic_id=data.topic_id, attempts=0, correct_answers=0, accuracy=0.0,
        )
        db.add(analysis)
    analysis.attempts += 1
    if data.correct:
        analysis.correct_answers += 1
    analysis.accuracy = analysis.correct_answers / analysis.attempts * 100
    await db.commit()


async def get_weak_topics(
    db: AsyncSession,
    user_id: uuid.UUID,
    max_accuracy: float = 60.0,
) -> list[WeakTopicAnalysis]:
    """Return weak topics (accuracy below threshold) for the given user, ordered by accuracy asc."""
    result = await db.execute(
        select(WeakTopicAnalysis)
        .where(
            WeakTopicAnalysis.user_id == user_id,
            WeakTopicAnalysis.accuracy < max_accuracy,
        )
        .order_by(WeakTopicAnalysis.accuracy.asc())
        .limit(5)
    )
    return list(result.scalars().all())


async def get_weak_topic_counts_for_users(
    db: AsyncSession, user_ids: list[uuid.UUID], max_accuracy: float = 60.0,
) -> dict[uuid.UUID, int]:
    """Batched count of weak topics per student, for the parent multi-child
    summary — a count is all that view needs, not the full ranked list
    get_weak_topics returns, so this is a single GROUP BY rather than N
    per-child queries."""
    if not user_ids:
        return {}
    rows = (await db.execute(
        select(WeakTopicAnalysis.user_id, func.count())
        .where(
            WeakTopicAnalysis.user_id.in_(user_ids),
            WeakTopicAnalysis.accuracy < max_accuracy,
        )
        .group_by(WeakTopicAnalysis.user_id)
    )).all()
    counts = {uid: 0 for uid in user_ids}
    counts.update({uid: n for uid, n in rows})
    return counts
