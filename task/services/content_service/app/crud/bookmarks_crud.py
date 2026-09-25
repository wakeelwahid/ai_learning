import uuid

from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.content import (
    Bookmark,
    Chapter,
    ContentBoard,
    ContentClass,
    Note,
    Question,
    Subject,
    Topic,
    Video,
)


async def toggle_bookmark(
    db: AsyncSession, user_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID,
) -> bool:
    """Add the bookmark if it doesn't exist, remove it if it does.
    Returns the new state: True if now bookmarked, False if now removed."""
    existing = await db.scalar(
        select(Bookmark).where(
            Bookmark.user_id == user_id,
            Bookmark.entity_type == entity_type,
            Bookmark.entity_id == entity_id,
        )
    )
    if existing:
        await db.delete(existing)
        await db.commit()
        return False
    db.add(Bookmark(user_id=user_id, entity_type=entity_type, entity_id=entity_id))
    await db.commit()
    return True


async def get_bookmarked_entity_ids(
    db: AsyncSession, user_id: uuid.UUID, entity_type: str,
) -> set[uuid.UUID]:
    """Cheap membership check — e.g. to mark `is_bookmarked` on a video list
    without a per-item round trip."""
    rows = (await db.execute(
        select(Bookmark.entity_id).where(
            Bookmark.user_id == user_id, Bookmark.entity_type == entity_type,
        )
    )).scalars().all()
    return set(rows)


async def get_user_bookmarked_videos(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Resolved (not just IDs) list of a user's bookmarked videos, with the
    same board/class/subject/chapter context get_continue_watching uses, so
    the frontend can render a real card (title, thumbnail, breadcrumb).
    A video hangs off EITHER a topic OR a question (never both), so the
    chapter is resolved through whichever side is populated — same
    COALESCE(topic.chapter_id, question.chapter_id) shape used elsewhere in
    this file, expressed as two outer joins picked apart in Python below
    rather than a SQL-level COALESCE."""
    chapter_via_topic = aliased(Chapter)
    chapter_via_question = aliased(Chapter)
    stmt = (
        select(
            Bookmark.id.label("bookmark_id"),
            Bookmark.created_at.label("bookmarked_at"),
            Video.id.label("video_id"),
            Video.title,
            Video.youtube_id,
            Video.duration_seconds,
            Video.thumbnail_url,
            Topic.title.label("topic_name"),
            sqlfunc.coalesce(chapter_via_topic.title, chapter_via_question.title).label("chapter_name"),
            Subject.name.label("subject_name"),
            Subject.id.label("subject_id"),
            ContentClass.number.label("class_number"),
            ContentBoard.name.label("board_name"),
        )
        .select_from(Bookmark)
        .join(Video, Video.id == Bookmark.entity_id)
        .outerjoin(Topic, Topic.id == Video.topic_id)
        .outerjoin(Question, Question.id == Video.question_id)
        .outerjoin(chapter_via_topic, chapter_via_topic.id == Topic.chapter_id)
        .outerjoin(chapter_via_question, chapter_via_question.id == Question.chapter_id)
        .outerjoin(
            Subject,
            Subject.id == sqlfunc.coalesce(chapter_via_topic.subject_id, chapter_via_question.subject_id),
        )
        .outerjoin(ContentClass, ContentClass.id == Subject.class_id)
        .outerjoin(ContentBoard, ContentBoard.id == ContentClass.board_id)
        .where(
            Bookmark.user_id == user_id,
            Bookmark.entity_type == "video",
            Video.is_active.is_(True),
        )
        .order_by(Bookmark.created_at.desc())
    )
    rows = (await db.execute(stmt)).mappings().all()
    return [dict(r) for r in rows]


async def get_user_bookmarked_notes(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    stmt = (
        select(
            Bookmark.id.label("bookmark_id"),
            Bookmark.created_at.label("bookmarked_at"),
            Note.id.label("note_id"),
            Note.title,
            Note.note_type,
            Note.s3_key,
            Note.is_premium,
            Chapter.title.label("chapter_name"),
            Subject.name.label("subject_name"),
        )
        .select_from(Bookmark)
        .join(Note, Note.id == Bookmark.entity_id)
        .outerjoin(Chapter, Chapter.id == Note.chapter_id)
        .outerjoin(Subject, Subject.id == Chapter.subject_id)
        .where(
            Bookmark.user_id == user_id,
            Bookmark.entity_type == "note",
            Note.is_active.is_(True),
        )
        .order_by(Bookmark.created_at.desc())
    )
    rows = (await db.execute(stmt)).mappings().all()
    return [dict(r) for r in rows]


# ── Assignments ──────────────────────────────────────────────────────────────────
