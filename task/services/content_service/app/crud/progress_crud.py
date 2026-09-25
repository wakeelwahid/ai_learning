import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func as sqlfunc
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.content import (
    Assignment,
    AssignmentTarget,
    Bookmark,
    Chapter,
    CompletionCertificate,
    Exercise,
    Note,
    Question,
    Subject,
    Topic,
    UserLearningProgress,
    Video,
    VideoProgress,
)


async def upsert_progress_record(db: AsyncSession, user_id: uuid.UUID, entity_type: str,
                            entity_id: uuid.UUID, status: str = "completed",
                            score: float | None = None) -> dict:
    now = datetime.now(timezone.utc)
    values = {
        "user_id": user_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "status": status,
        "score": score,
        "completed_at": now if status == "completed" else None,
        "updated_at": now,
    }
    stmt = pg_insert(UserLearningProgress).values(**values, created_at=now)
    update_set: dict = {"status": status, "updated_at": now}
    if score is not None:
        update_set["score"] = score
    if status == "completed":
        update_set["completed_at"] = now
    stmt = stmt.on_conflict_do_update(
        constraint="uq_user_entity_progress",
        set_=update_set,
    )
    await db.execute(stmt)
    await db.commit()
    row = (await db.execute(
        select(UserLearningProgress).where(
            UserLearningProgress.user_id == user_id,
            UserLearningProgress.entity_type == entity_type,
            UserLearningProgress.entity_id == entity_id,
        )
    )).scalar_one()
    return {
        "user_id": str(row.user_id),
        "entity_type": row.entity_type,
        "entity_id": str(row.entity_id),
        "status": row.status,
        "score": row.score,
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
    }


async def mark_video_progress_complete(db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID) -> None:
    """Mark the per-video watch record complete (fetch-or-create)."""
    vp = (await db.execute(
        select(VideoProgress).where(
            VideoProgress.user_id == user_id,
            VideoProgress.video_id == video_id,
        )
    )).scalar_one_or_none()
    if vp:
        vp.is_completed = True
        vp.completion_percentage = 100.0
        vp.status = "completed"
    else:
        db.add(VideoProgress(
            user_id=user_id, video_id=video_id,
            watched_seconds=0, is_completed=True, completion_percentage=100.0,
            status="completed",
        ))
    await db.commit()


async def get_video_chapter_and_subject(db: AsyncSession, video_id: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID] | None:
    """Resolve a video's (chapter_id, subject_id) via either attachment path —
    Video.topic_id -> Topic.chapter_id, or Video.question_id -> Question.chapter_id
    (see get_chapter_progress_stats/get_subject_progress_stats for the same
    dual-path pattern). Returns None if the video has neither link."""
    row = (await db.execute(
        select(Chapter.id, Chapter.subject_id)
        .select_from(Video)
        .outerjoin(Topic, Video.topic_id == Topic.id)
        .outerjoin(Question, Video.question_id == Question.id)
        .join(
            Chapter,
            or_(Topic.chapter_id == Chapter.id, Question.chapter_id == Chapter.id),
        )
        .where(Video.id == video_id)
    )).first()
    return (row[0], row[1]) if row else None


async def get_chapter_progress_stats(db: AsyncSession, chapter_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    # Count exercises
    ex_count = (await db.execute(
        select(sqlfunc.count()).select_from(Exercise)
        .where(Exercise.chapter_id == chapter_id, Exercise.is_active == True)  # noqa: E712
    )).scalar() or 0

    # Count exercises completed by user
    ex_done = (await db.execute(
        select(sqlfunc.count()).select_from(UserLearningProgress)
        .where(
            UserLearningProgress.user_id == user_id,
            UserLearningProgress.entity_type == "exercise",
            UserLearningProgress.status == "completed",
        )
    )).scalar() or 0

    # Count videos in this chapter — attached via either a Question (solution
    # videos) or a Topic (lesson videos); count both paths.
    vid_count = (await db.execute(
        select(sqlfunc.count()).select_from(Video)
        .outerjoin(Question, Video.question_id == Question.id)
        .outerjoin(Topic, Video.topic_id == Topic.id)
        .where(
            or_(Question.chapter_id == chapter_id, Topic.chapter_id == chapter_id),
            Video.is_active == True,  # noqa: E712
        )
    )).scalar() or 0

    # Count videos completed by user
    vid_done = (await db.execute(
        select(sqlfunc.count()).select_from(VideoProgress)
        .join(Video, VideoProgress.video_id == Video.id)
        .outerjoin(Question, Video.question_id == Question.id)
        .outerjoin(Topic, Video.topic_id == Topic.id)
        .where(
            or_(Question.chapter_id == chapter_id, Topic.chapter_id == chapter_id),
            VideoProgress.user_id == user_id,
            VideoProgress.is_completed == True,  # noqa: E712
        )
    )).scalar() or 0

    # Chapter-level completion record
    ch_progress = (await db.execute(
        select(UserLearningProgress).where(
            UserLearningProgress.user_id == user_id,
            UserLearningProgress.entity_type == "chapter",
            UserLearningProgress.entity_id == chapter_id,
        )
    )).scalar_one_or_none()

    return {
        "exercises_total": ex_count,
        "exercises_completed": ex_done,
        "videos_total": vid_count,
        "videos_completed": vid_done,
        "progress": ch_progress,
    }


async def get_exercise_progress_stats(db: AsyncSession, exercise_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    # Videos linked to questions in this exercise
    vid_count = (await db.execute(
        select(sqlfunc.count()).select_from(Video)
        .join(Question, Video.question_id == Question.id)
        .where(Question.exercise_id == exercise_id, Video.is_active == True)  # noqa: E712
    )).scalar() or 0

    vid_done = (await db.execute(
        select(sqlfunc.count()).select_from(VideoProgress)
        .join(Video, VideoProgress.video_id == Video.id)
        .join(Question, Video.question_id == Question.id)
        .where(
            Question.exercise_id == exercise_id,
            VideoProgress.user_id == user_id,
            VideoProgress.is_completed == True,  # noqa: E712
        )
    )).scalar() or 0

    ex_progress = (await db.execute(
        select(UserLearningProgress).where(
            UserLearningProgress.user_id == user_id,
            UserLearningProgress.entity_type == "exercise",
            UserLearningProgress.entity_id == exercise_id,
        )
    )).scalar_one_or_none()

    return {
        "videos_total": vid_count,
        "videos_completed": vid_done,
        "progress": ex_progress,
    }


async def get_subject_progress_stats(db: AsyncSession, subject_id: uuid.UUID, user_id: uuid.UUID) -> dict | None:
    # All chapters in subject
    chapters = (await db.execute(
        select(Chapter).where(Chapter.subject_id == subject_id, Chapter.is_active == True)  # noqa: E712
    )).scalars().all()

    ch_ids = [c.id for c in chapters]
    ch_count = len(ch_ids)

    if ch_count == 0:
        return None

    # Videos in subject — a Video attaches to a chapter via EITHER a Question
    # (solution videos) OR a Topic (lesson videos); count both paths, since a
    # subject's real content is predominantly topic-attached lesson videos.
    vid_count = (await db.execute(
        select(sqlfunc.count()).select_from(Video)
        .outerjoin(Question, Video.question_id == Question.id)
        .outerjoin(Topic, Video.topic_id == Topic.id)
        .where(
            or_(Question.chapter_id.in_(ch_ids), Topic.chapter_id.in_(ch_ids)),
            Video.is_active == True,  # noqa: E712
        )
    )).scalar() or 0

    # Videos done by user
    vid_done = (await db.execute(
        select(sqlfunc.count()).select_from(VideoProgress)
        .join(Video, VideoProgress.video_id == Video.id)
        .outerjoin(Question, Video.question_id == Question.id)
        .outerjoin(Topic, Video.topic_id == Topic.id)
        .where(
            or_(Question.chapter_id.in_(ch_ids), Topic.chapter_id.in_(ch_ids)),
            VideoProgress.user_id == user_id,
            VideoProgress.is_completed == True,  # noqa: E712
        )
    )).scalar() or 0

    # Chapters completed
    ch_done = (await db.execute(
        select(sqlfunc.count()).select_from(UserLearningProgress)
        .where(
            UserLearningProgress.user_id == user_id,
            UserLearningProgress.entity_type == "chapter",
            UserLearningProgress.entity_id.in_(ch_ids),
            UserLearningProgress.status == "completed",
        )
    )).scalar() or 0

    subj_progress = (await db.execute(
        select(UserLearningProgress).where(
            UserLearningProgress.user_id == user_id,
            UserLearningProgress.entity_type == "subject",
            UserLearningProgress.entity_id == subject_id,
        )
    )).scalar_one_or_none()

    return {
        "chapters_total": ch_count,
        "chapters_completed": ch_done,
        "videos_total": vid_count,
        "videos_completed": vid_done,
        "progress": subj_progress,
    }


# ── Parent RAG: one student's whole learning footprint ────────────────────────
def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


async def get_student_video_summary(db: AsyncSession, user_id: uuid.UUID, days: int, limit: int = 40) -> dict:
    """Watch totals (all time) plus the most recently touched videos in the
    window, each resolved to its chapter/subject through whichever of the
    topic/question links is populated — same dual-path shape as
    get_video_chapter_and_subject, done once for the whole list."""
    totals = (await db.execute(
        select(
            sqlfunc.count(),
            sqlfunc.count().filter(VideoProgress.is_completed.is_(True)),
            sqlfunc.coalesce(sqlfunc.sum(VideoProgress.actual_watched_seconds), 0),
        ).where(VideoProgress.user_id == user_id)
    )).one()

    chapter_via_topic = aliased(Chapter)
    chapter_via_question = aliased(Chapter)
    rows = (await db.execute(
        select(
            VideoProgress.video_id,
            Video.title,
            Subject.name.label("subject"),
            sqlfunc.coalesce(chapter_via_topic.title, chapter_via_question.title).label("chapter"),
            VideoProgress.completion_percentage,
            VideoProgress.is_completed,
            VideoProgress.updated_at,
        )
        .select_from(VideoProgress)
        .outerjoin(Video, Video.id == VideoProgress.video_id)
        .outerjoin(Topic, Topic.id == Video.topic_id)
        .outerjoin(Question, Question.id == Video.question_id)
        .outerjoin(chapter_via_topic, chapter_via_topic.id == Topic.chapter_id)
        .outerjoin(chapter_via_question, chapter_via_question.id == Question.chapter_id)
        .outerjoin(
            Subject,
            Subject.id == sqlfunc.coalesce(chapter_via_topic.subject_id, chapter_via_question.subject_id),
        )
        .where(VideoProgress.user_id == user_id, VideoProgress.updated_at >= _since(days))
        .order_by(VideoProgress.updated_at.desc())
        .limit(limit)
    )).mappings().all()

    return {
        "total_watched": totals[0],
        "completed": totals[1],
        "total_watch_seconds": int(totals[2]),
        "recent": [dict(r) for r in rows],
    }


async def get_student_completion_breakdown(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Learning-progress rollups: one grouped query per axis, no per-row lookups."""
    by_type = (await db.execute(
        select(
            UserLearningProgress.entity_type,
            sqlfunc.count(),
            sqlfunc.count().filter(UserLearningProgress.status == "completed"),
            sqlfunc.avg(UserLearningProgress.score),
        )
        .where(UserLearningProgress.user_id == user_id)
        .group_by(UserLearningProgress.entity_type)
    )).all()

    # Per-subject chapter completion — join the user's chapter rows up to their
    # subject, then fetch every subject's chapter count in one second query.
    by_subject = (await db.execute(
        select(
            Subject.id,
            Subject.name,
            sqlfunc.count().filter(UserLearningProgress.status == "completed"),
            sqlfunc.avg(UserLearningProgress.score),
        )
        .select_from(UserLearningProgress)
        .join(Chapter, Chapter.id == UserLearningProgress.entity_id)
        .join(Subject, Subject.id == Chapter.subject_id)
        .where(
            UserLearningProgress.user_id == user_id,
            UserLearningProgress.entity_type == "chapter",
        )
        .group_by(Subject.id, Subject.name)
    )).all()

    subject_ids = [s[0] for s in by_subject]
    totals: dict[uuid.UUID, int] = {}
    if subject_ids:
        totals = dict((await db.execute(
            select(Chapter.subject_id, sqlfunc.count())
            .where(Chapter.subject_id.in_(subject_ids), Chapter.is_active.is_(True))
            .group_by(Chapter.subject_id)
        )).all())

    return {
        "by_subject": [
            {
                "subject_id": sid,
                "subject_name": name,
                "chapters_total": totals.get(sid),
                "chapters_completed": done,
                "avg_score": avg,
            }
            for sid, name, done, avg in by_subject
        ],
        "by_entity_type": [
            {"entity_type": etype, "total": total, "completed": done, "avg_score": avg}
            for etype, total, done, avg in by_type
        ],
    }


async def get_student_bookmarks(db: AsyncSession, user_id: uuid.UUID, limit: int = 50) -> list[dict]:
    """Saved videos and notes. Titles/subjects are resolved with one `in_`
    query per entity type, not one per bookmark."""
    rows = (await db.execute(
        select(Bookmark.entity_type, Bookmark.entity_id, Bookmark.created_at)
        .where(Bookmark.user_id == user_id)
        .order_by(Bookmark.created_at.desc())
        .limit(limit)
    )).all()

    video_ids = [r[1] for r in rows if r[0] == "video"]
    note_ids = [r[1] for r in rows if r[0] == "note"]
    labels: dict[uuid.UUID, tuple[str, str | None]] = {}

    if video_ids:
        chapter_via_topic = aliased(Chapter)
        chapter_via_question = aliased(Chapter)
        vrows = (await db.execute(
            select(Video.id, Video.title, Subject.name)
            .outerjoin(Topic, Topic.id == Video.topic_id)
            .outerjoin(Question, Question.id == Video.question_id)
            .outerjoin(chapter_via_topic, chapter_via_topic.id == Topic.chapter_id)
            .outerjoin(chapter_via_question, chapter_via_question.id == Question.chapter_id)
            .outerjoin(
                Subject,
                Subject.id == sqlfunc.coalesce(chapter_via_topic.subject_id, chapter_via_question.subject_id),
            )
            .where(Video.id.in_(video_ids))
        )).all()
        labels.update({vid: (title, subject) for vid, title, subject in vrows})

    if note_ids:
        nrows = (await db.execute(
            select(Note.id, Note.title, Subject.name)
            .outerjoin(Chapter, Chapter.id == Note.chapter_id)
            .outerjoin(Subject, Subject.id == Chapter.subject_id)
            .where(Note.id.in_(note_ids))
        )).all()
        labels.update({nid: (title, subject) for nid, title, subject in nrows})

    return [
        {
            "entity_type": etype,
            "entity_id": eid,
            "title": labels.get(eid, (None, None))[0],
            "subject": labels.get(eid, (None, None))[1],
            "created_at": created_at,
        }
        for etype, eid, created_at in rows
    ]


async def get_student_certificates(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    rows = (await db.execute(
        select(
            CompletionCertificate.certificate_number,
            CompletionCertificate.chapter_name,
            CompletionCertificate.subject_name,
            CompletionCertificate.board,
            CompletionCertificate.class_num,
            CompletionCertificate.issued_at,
        )
        .where(CompletionCertificate.user_id == user_id)
        .order_by(CompletionCertificate.issued_at.desc())
    )).mappings().all()
    return [dict(r) for r in rows]


async def get_student_assignment_summary(db: AsyncSession, user_id: uuid.UUID, limit: int = 20) -> dict:
    """Assigned vs still-pending, where "done" is the same derived signal
    get_student_assignments uses — a completed UserLearningProgress row for
    the assignment's (entity_type, entity_id)."""
    done = (
        (UserLearningProgress.user_id == AssignmentTarget.student_id)
        & (UserLearningProgress.entity_type == Assignment.entity_type)
        & (UserLearningProgress.entity_id == Assignment.entity_id)
        & (UserLearningProgress.status == "completed")
    )
    rows = (await db.execute(
        select(
            Assignment.title,
            Assignment.due_at,
            Assignment.entity_type,
            UserLearningProgress.id.label("completed_id"),
        )
        .select_from(AssignmentTarget)
        .join(Assignment, Assignment.id == AssignmentTarget.assignment_id)
        .outerjoin(UserLearningProgress, done)
        .where(AssignmentTarget.student_id == user_id, Assignment.is_active.is_(True))
        .order_by(Assignment.due_at.asc().nulls_last(), Assignment.created_at.desc())
    )).mappings().all()

    return {
        "assigned": len(rows),
        "pending": sum(1 for r in rows if r["completed_id"] is None),
        "recent": [
            {"title": r["title"], "due_at": r["due_at"], "entity_type": r["entity_type"]}
            for r in rows[:limit]
        ],
    }


# ── Info Pages (CMS) ──────────────────────────────────────────────────────────
