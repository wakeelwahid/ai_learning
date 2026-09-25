import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.revision_session import RevisionSession


def session_dict(row: RevisionSession) -> dict:
    return {
        "id": str(row.id),
        "topic_id": str(row.topic_id) if row.topic_id else None,
        "subject_id": str(row.subject_id) if row.subject_id else None,
        "source": row.source,
        "duration_sec": row.duration_sec,
        "is_completed": row.is_completed,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
    }


async def create(
    db: AsyncSession,
    user_id: uuid.UUID,
    topic_id: uuid.UUID | None,
    subject_id: uuid.UUID | None,
    source: str,
) -> RevisionSession:
    row = RevisionSession(
        user_id=user_id,
        topic_id=topic_id,
        subject_id=subject_id,
        source=source,
        duration_sec=0,
        is_completed=False,
        started_at=datetime.now(timezone.utc),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get(db: AsyncSession, session_id: uuid.UUID) -> RevisionSession | None:
    return (await db.execute(
        select(RevisionSession).where(RevisionSession.id == session_id)
    )).scalar_one_or_none()


async def finish(
    db: AsyncSession, row: RevisionSession, duration_sec: int, is_completed: bool
) -> RevisionSession:
    row.duration_sec = duration_sec
    row.is_completed = is_completed
    if is_completed:
        row.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return row


async def list_for_user(
    db: AsyncSession, user_id: uuid.UUID, days: int | None = None, limit: int = 50
) -> list[RevisionSession]:
    stmt = select(RevisionSession).where(RevisionSession.user_id == user_id)
    if days is not None:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        stmt = stmt.where(RevisionSession.started_at >= since)
    stmt = stmt.order_by(RevisionSession.started_at.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def has_completed_session_since(
    db: AsyncSession, user_id: uuid.UUID, since: datetime, topic_id: uuid.UUID | None = None,
) -> bool:
    """True if this user has at least one completed revision session started
    at/after `since`, optionally scoped to a specific topic. Used by the
    internal /internal/revision/completed/{user_id} route —
    gamification_service's Challenge Programs feature calls this to verify
    a study_session-type challenge task.

    Unlike video/quiz/battle, a revision session doesn't pre-exist for an
    admin to reference at challenge-authoring time (a student starts a new
    one on demand) — so a study_session task is "complete any (optionally
    topic-scoped) session after joining," not "complete THIS specific
    session," and `since` anchors that to the student's own enrollment
    time so a session from before they joined can't retroactively count."""
    stmt = select(RevisionSession.id).where(
        RevisionSession.user_id == user_id,
        RevisionSession.is_completed == True,  # noqa: E712
        RevisionSession.started_at >= since,
    )
    if topic_id is not None:
        stmt = stmt.where(RevisionSession.topic_id == topic_id)
    result = await db.execute(stmt.limit(1))
    return result.scalar_one_or_none() is not None


async def totals_for_user(db: AsyncSession, user_id: uuid.UUID, days: int) -> dict:
    """Aggregates over the whole window, independent of the `limit` applied to
    the returned session list."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    row = (await db.execute(
        select(
            func.count(RevisionSession.id),
            func.count(RevisionSession.id).filter(RevisionSession.is_completed.is_(True)),
            func.coalesce(func.sum(RevisionSession.duration_sec), 0),
            func.count(func.distinct(RevisionSession.topic_id)),
        ).where(RevisionSession.user_id == user_id, RevisionSession.started_at >= since)
    )).one()
    sessions, completed, total_sec, topics = row
    return {
        "sessions": sessions,
        "completed": completed,
        "total_minutes": int(total_sec // 60),
        "topics_revised": topics,
    }
