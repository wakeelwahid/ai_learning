import uuid
from datetime import datetime, timezone

from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    Chapter,
    ContentBoard,
    ContentClass,
    Exercise,
    Subject,
    Topic,
    Video,
    VideoProgress,
)
from app.schemas.content import (
    VideoCreate,
    VideoProgressUpdate,
)


async def get_videos(
    db: AsyncSession,
    topic_id: uuid.UUID,
    limit: int = 200,
    offset: int = 0,
    viewer_board: str | None = None,
    viewer_class: int | None = None,
) -> list[Video]:
    """A video's own target_board/target_class is an independent, optional
    filter on top of its topic's fixed class — NULL on either axis means "for
    everyone" on that axis. When the caller's board/class aren't known (e.g.
    an admin/teacher browsing), no filtering is applied."""
    stmt = (
        select(Video)
        .where(Video.topic_id == topic_id, Video.is_active == True)  # noqa: E712
    )
    if viewer_board:
        stmt = stmt.where(or_(Video.target_board.is_(None), Video.target_board == viewer_board))
    if viewer_class:
        stmt = stmt.where(or_(Video.target_class.is_(None), Video.target_class == viewer_class))
    stmt = stmt.order_by(Video.sequence).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def create_video(db: AsyncSession, data: VideoCreate) -> Video:
    video = Video(**data.model_dump())
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return video


async def get_video(db: AsyncSession, video_id: uuid.UUID) -> Video | None:
    return await db.get(Video, video_id)


async def get_video_by_youtube_id(db: AsyncSession, youtube_id: str) -> Video | None:
    result = await db.execute(
        select(Video).where(Video.youtube_id == youtube_id, Video.is_active == True).limit(1)  # noqa: E712
    )
    return result.scalar_one_or_none()


async def has_completed_any_video(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """True if this user has completed at least one video.

    Used by the internal /videos/internal/completed/{user_id} route (see
    routes/videos.py) — referral_service's server-side qualification check
    calls this instead of trusting a client-asserted "video_watched" flag.
    """
    result = await db.execute(
        select(VideoProgress.id)
        .where(VideoProgress.user_id == user_id, VideoProgress.is_completed == True)  # noqa: E712
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def has_completed_specific_video(db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID) -> bool:
    """True if this user has completed THIS specific video.

    Used by the internal /videos/internal/{video_id}/completed/{user_id}
    route — gamification_service's Challenge Programs feature calls this to
    verify a video-type challenge task server-side, never trusting a
    client-asserted completion."""
    result = await db.execute(
        select(VideoProgress.id)
        .where(
            VideoProgress.user_id == user_id,
            VideoProgress.video_id == video_id,
            VideoProgress.is_completed == True,  # noqa: E712
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_or_create_video_progress(
    db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID
) -> VideoProgress | None:
    result = await db.execute(
        select(VideoProgress).where(
            VideoProgress.user_id == user_id,
            VideoProgress.video_id == video_id,
        )
    )
    return result.scalar_one_or_none()


async def update_video_progress(
    db: AsyncSession, progress: VideoProgress, data: VideoProgressUpdate
) -> VideoProgress:
    progress.watched_seconds = data.watched_seconds
    progress.is_completed = data.is_completed
    # completion_percentage requires video.duration_seconds; use upsert_video_progress instead
    await db.commit()
    await db.refresh(progress)
    return progress


async def upsert_video_progress(
    db: AsyncSession,
    user_id: uuid.UUID,
    video_id: uuid.UUID,
    data: VideoProgressUpdate,
    video: Video,
) -> VideoProgress:

    pct = min(100.0, (data.watched_seconds / video.duration_seconds * 100)) if video.duration_seconds > 0 else 0.0
    is_completed = data.is_completed or pct >= 90
    now = datetime.now(timezone.utc)

    # Resolve status: explicit completion wins, then the client-sent status, else in_progress
    status = "completed" if is_completed else (data.status or "playing")
    if status == "playing":
        status = "in_progress"
    # last_position = client playhead if provided, else furthest watched
    position = data.position_seconds if data.position_seconds is not None else data.watched_seconds

    progress = await get_or_create_video_progress(db, user_id, video_id)

    if progress:
        # ── Skip detection ────────────────────────────────────────────────────
        # Only credit actual_watched_seconds when the playhead advances at a
        # plausible speed (≤ 2× real-time). Skipping forward won't increase it.
        MAX_PLAYBACK_SPEED = 2.0  # fastest allowed speed on the player
        TOLERANCE_SECS = 5        # buffer for network jitter / interval delays
        prev_updated = progress.updated_at
        if prev_updated is not None and progress.last_position_seconds is not None:
            if prev_updated.tzinfo is None:
                prev_updated = prev_updated.replace(tzinfo=timezone.utc)
            real_elapsed = max(0.0, (now - prev_updated).total_seconds())
            position_delta = position - (progress.last_position_seconds or 0)
            max_creditable = real_elapsed * MAX_PLAYBACK_SPEED + TOLERANCE_SECS
            if 0 < position_delta <= max_creditable:
                credit = min(int(position_delta), int(max_creditable))
                new_actual = min(
                    video.duration_seconds,
                    (progress.actual_watched_seconds or 0) + credit,
                )
                progress.actual_watched_seconds = new_actual
            # else: backward seek (replay) or forward skip — don't credit
        else:
            # First update — trust the reported position as a starting point
            progress.actual_watched_seconds = min(
                video.duration_seconds, progress.actual_watched_seconds or 0
            )

        # watched_seconds tracks the FURTHEST point reached (for resume / completion %)
        progress.watched_seconds = max(progress.watched_seconds or 0, data.watched_seconds)
        progress.completion_percentage = max(progress.completion_percentage or 0.0, pct)
        progress.is_completed = is_completed
        progress.last_position_seconds = position
        # Pause/resume timestamps
        if status == "paused" and progress.status != "paused":
            progress.paused_at = now
        if status == "in_progress" and progress.status == "paused":
            progress.resumed_at = now
        progress.status = status
    else:
        progress = VideoProgress(
            user_id=user_id,
            video_id=video_id,
            watched_seconds=data.watched_seconds,
            actual_watched_seconds=0,
            is_completed=is_completed,
            completion_percentage=pct,
            status=status,
            last_position_seconds=position,
            paused_at=now if status == "paused" else None,
            resumed_at=None,
        )
        db.add(progress)

    await db.commit()
    await db.refresh(progress)
    return progress


async def get_chapter_all_videos(db: AsyncSession, chapter_id: uuid.UUID) -> list[Video]:
    result = await db.execute(
        select(Video)
        .join(Topic, Video.topic_id == Topic.id)
        .where(Topic.chapter_id == chapter_id, Video.is_active == True)  # noqa: E712
        .order_by(Topic.sequence.asc(), Video.sequence.asc())
    )
    return result.scalars().all()


async def create_chapter_video(db: AsyncSession, chapter_id: uuid.UUID, data) -> Video:
    result = await db.execute(
        select(Topic)
        .where(Topic.chapter_id == chapter_id)
        .order_by(Topic.sequence)
        .limit(1)
    )
    topic = result.scalar_one_or_none()

    if topic is None:
        topic = Topic(chapter_id=chapter_id, title="General", sequence=0, difficulty="medium")
        db.add(topic)
        await db.flush()

    video = Video(
        topic_id=topic.id,
        title=data.title,
        youtube_id=data.youtube_id,
        youtube_id_hi=data.youtube_id_hi,
        youtube_id_pa=data.youtube_id_pa,
        youtube_id_bho=data.youtube_id_bho,
        duration_seconds=data.duration_seconds,
        thumbnail_url=data.thumbnail_url,
        sequence=data.sequence,
        is_premium=data.is_premium,
        target_board=data.target_board,
        target_class=data.target_class,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return video


async def deactivate_video(db: AsyncSession, video: Video) -> None:
    video.is_active = False
    await db.commit()


# ── Exercise management ───────────────────────────────────────────────────────


async def get_video_feed(
    db: AsyncSession,
    class_num: int | None,
    board: str | None,
    subject: str | None,
    sort: str,
    limit: int,
) -> list:
    order = "watch_count DESC, v.created_at DESC" if sort == "popular" else "v.created_at DESC, v.sequence ASC"
    sql = text(f"""
        SELECT v.id, v.title, v.youtube_id, v.youtube_id_hi, v.thumbnail_url,
               v.duration_seconds, v.notes_url,
               v.is_premium, v.created_at,
               s.name  AS subject,
               ch.id   AS chapter_id,
               ch.title AS chapter,
               cl.number AS class_num,
               b.name  AS board,
               COALESCE(vp.cnt, 0) AS watch_count
        FROM videos v
        LEFT JOIN topics    t  ON v.topic_id = t.id
        LEFT JOIN questions q  ON v.question_id = q.id
        LEFT JOIN chapters  ch ON ch.id = COALESCE(t.chapter_id, q.chapter_id)
        LEFT JOIN subjects  s  ON s.id = ch.subject_id
        LEFT JOIN classes   cl ON cl.id = s.class_id
        LEFT JOIN boards    b  ON b.id = cl.board_id
        LEFT JOIN (SELECT video_id, COUNT(DISTINCT user_id) AS cnt
                   FROM video_progress GROUP BY video_id) vp ON vp.video_id = v.id
        WHERE v.is_active
          AND (CAST(:class_num AS INTEGER) IS NULL OR cl.number = CAST(:class_num AS INTEGER))
          AND (CAST(:board AS TEXT) IS NULL OR LOWER(b.name) = LOWER(CAST(:board AS TEXT)) OR LOWER(b.code) = LOWER(CAST(:board AS TEXT)))
          AND (CAST(:subject AS TEXT) IS NULL OR LOWER(s.name) = LOWER(CAST(:subject AS TEXT)))
        ORDER BY {order}
        LIMIT :limit
    """)
    rows = (await db.execute(sql, {
        "class_num": class_num, "board": board, "subject": subject, "limit": limit,
    })).mappings().all()
    return [dict(r) for r in rows]


async def get_videos_by_topic_ids(
    db: AsyncSession, topic_ids: list[uuid.UUID], exclude_video_ids: set[uuid.UUID], limit: int,
) -> list[dict]:
    """Real videos covering the given topics — the building block for
    personalized recommendations (weak-topic-driven), as opposed to the old
    /videos/recommended alias which just returned "recent" regardless of
    the caller. Excludes videos the student has already completed so the
    feed doesn't recommend something they've already watched."""
    if not topic_ids:
        return []
    stmt = (
        select(
            Video.id, Video.title, Video.youtube_id, Video.youtube_id_hi,
            Video.thumbnail_url, Video.duration_seconds, Video.is_premium, Video.created_at,
            Subject.name.label("subject"),
            Chapter.id.label("chapter_id"), Chapter.title.label("chapter"),
            ContentClass.number.label("class_num"), ContentBoard.name.label("board"),
            Topic.id.label("topic_id"),
        )
        .select_from(Video)
        .join(Topic, Topic.id == Video.topic_id)
        .outerjoin(Chapter, Chapter.id == Topic.chapter_id)
        .outerjoin(Subject, Subject.id == Chapter.subject_id)
        .outerjoin(ContentClass, ContentClass.id == Subject.class_id)
        .outerjoin(ContentBoard, ContentBoard.id == ContentClass.board_id)
        .where(
            Video.is_active.is_(True),
            Topic.id.in_(topic_ids),
            Video.id.notin_(exclude_video_ids) if exclude_video_ids else True,
        )
        .order_by(Video.sequence.asc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).mappings().all()
    return [dict(r) for r in rows]


async def get_videos_by_class_board(
    db: AsyncSession, class_num: int | None, board: str | None,
    exclude_video_ids: set[uuid.UUID], limit: int,
) -> list[dict]:
    """Class/board-filtered videos, ORM-built (mirrors get_videos_by_topic_ids'
    join shape) — the fallback pool for a student's daily "watch N videos"
    goal when they have no weak-topic signal yet (new student / no quiz
    history). class_num/board are optional; omitting both returns the most
    recent active videos platform-wide."""
    stmt = (
        select(
            Video.id, Video.title, Video.youtube_id, Video.youtube_id_hi,
            Video.thumbnail_url, Video.duration_seconds, Video.is_premium, Video.created_at,
            Subject.name.label("subject"),
            Chapter.id.label("chapter_id"), Chapter.title.label("chapter"),
            ContentClass.number.label("class_num"), ContentBoard.name.label("board"),
        )
        .select_from(Video)
        .outerjoin(Topic, Topic.id == Video.topic_id)
        .outerjoin(Chapter, Chapter.id == Topic.chapter_id)
        .outerjoin(Subject, Subject.id == Chapter.subject_id)
        .outerjoin(ContentClass, ContentClass.id == Subject.class_id)
        .outerjoin(ContentBoard, ContentBoard.id == ContentClass.board_id)
        .where(Video.is_active.is_(True))
        .order_by(Video.created_at.desc(), Video.sequence.asc())
        .limit(limit)
    )
    if class_num is not None:
        stmt = stmt.where(ContentClass.number == class_num)
    if board:
        stmt = stmt.where(or_(
            ContentBoard.name.ilike(board),
            ContentBoard.code.ilike(board),
        ))
    if exclude_video_ids:
        stmt = stmt.where(Video.id.notin_(exclude_video_ids))
    rows = (await db.execute(stmt)).mappings().all()
    return [dict(r) for r in rows]


async def get_completed_video_ids(db: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    rows = (await db.execute(
        select(VideoProgress.video_id).where(
            VideoProgress.user_id == user_id, VideoProgress.is_completed.is_(True),
        )
    )).scalars().all()
    return set(rows)


async def get_continue_watching(db: AsyncSession, user_id: str, limit: int) -> list:
    sql = text("""
        SELECT v.id, v.title, v.youtube_id, v.youtube_id_hi, v.thumbnail_url,
               v.duration_seconds, v.notes_url,
               s.name   AS subject,
               ch.id    AS chapter_id,
               ch.title AS chapter,
               cl.number AS class_num,
               b.name   AS board,
               vp.completion_percentage AS progress,
               vp.watched_seconds,
               vp.last_position_seconds AS resume_at,
               vp.status,
               vp.paused_at,
               vp.resumed_at,
               vp.updated_at
        FROM video_progress vp
        JOIN videos v ON v.id = vp.video_id
        LEFT JOIN topics    t  ON v.topic_id = t.id
        LEFT JOIN questions q  ON v.question_id = q.id
        LEFT JOIN chapters  ch ON ch.id = COALESCE(t.chapter_id, q.chapter_id)
        LEFT JOIN subjects  s  ON s.id = ch.subject_id
        LEFT JOIN classes   cl ON cl.id = s.class_id
        LEFT JOIN boards    b  ON b.id = cl.board_id
        WHERE vp.user_id = CAST(:user_id AS UUID)
          AND vp.is_completed = FALSE
          AND vp.watched_seconds > 0
          AND v.is_active
        ORDER BY vp.updated_at DESC
        LIMIT :limit
    """)
    rows = (await db.execute(sql, {"user_id": user_id, "limit": limit})).mappings().all()
    return [dict(r) for r in rows]


# ── Bookmarks (save-for-later videos/notes) ─────────────────────────────────────
