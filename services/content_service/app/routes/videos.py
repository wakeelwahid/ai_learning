import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id, require_admin, require_internal, require_teacher
from app.core.redis import (
    cache_get_continue_watching,
    cache_get_progress,
    cache_get_video_feed,
    cache_invalidate_continue_watching,
    cache_set_continue_watching,
    cache_set_progress,
    cache_set_video_feed,
    catalog_invalidate,
    mark_progress_dirty,
)
from app.crud import videos_crud
from app.crud.seed_crud import seed_unlock_for_testing as _seed_unlock
from app.crud.videos_crud import (
    deactivate_video,
    get_continue_watching,
    get_or_create_video_progress,
    get_video as _get_video,
    get_video_by_youtube_id as crud_get_video_by_youtube_id,
    get_video_feed,
)
from app.database.session import get_db
from app.schemas.content import (
    ChapterVideoCreate,
    VideoCreate,
    VideoProgressResponse,
    VideoProgressUpdate,
    VideoResponse,
)
from app.services.content_service import ContentService

router = APIRouter(prefix="/content", tags=["content"])


@router.get(
    "/videos/internal/completed/{user_id}",
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
    summary="[Internal] Has this user completed at least one video?",
)
async def internal_has_completed_video(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Docker-network-only — referral_service's qualification check calls
    this instead of trusting a client-asserted "video_watched" flag."""
    return {"completed": await videos_crud.has_completed_any_video(db, user_id)}


@router.get(
    "/videos/internal/{video_id}/completed/{user_id}",
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
    summary="[Internal] Has this user completed THIS specific video?",
)
async def internal_has_completed_specific_video(
    video_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession = Depends(get_db),
):
    """Docker-network-only — gamification_service's Challenge Programs
    feature calls this to verify a video-type challenge task server-side."""
    return {"completed": await videos_crud.has_completed_specific_video(db, user_id, video_id)}


@router.get(
    "/videos/internal/daily-goal-picks/{user_id}",
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
    summary="[Internal] Pick N videos for a user's daily 'watch N videos' goal — weak-topic personalized, falls back to class/board",
)
async def internal_daily_goal_video_picks(
    user_id: uuid.UUID,
    count: int = Query(default=2, ge=1, le=10),
    class_num: int | None = Query(default=None),
    board: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Called by gamification_service each morning when assigning the video
    slot of a user's daily goal set. Same personalization tier as
    /videos/recommended (weak topics first, class/board second, most-recent
    last) but internal-gated since the caller has no end-user bearer token,
    and returns just the N video ids + titles the frontend needs to deep-link
    straight to them instead of "any video counts"."""
    completed = await videos_crud.get_completed_video_ids(db, user_id)

    weak_topic_ids = await _fetch_weak_topic_ids(user_id)
    rows = await videos_crud.get_videos_by_topic_ids(db, weak_topic_ids, completed, count) if weak_topic_ids else []
    personalized = bool(rows)

    if len(rows) < count:
        more = await videos_crud.get_videos_by_class_board(
            db, class_num, board, completed | {r["id"] for r in rows}, count - len(rows),
        )
        rows = rows + more

    return {
        "video_ids": [str(r["id"]) for r in rows],
        "videos": [{"id": str(r["id"]), "title": r["title"]} for r in rows],
        "personalized": personalized,
    }


@router.get("/video-feed", summary="Dashboard video feed (recent/popular) with curriculum context")
async def video_feed(
    class_num: int | None = Query(default=None),
    board:     str | None = Query(default=None),
    subject:   str | None = Query(default=None),
    sort:      str        = Query(default="recent"),   # recent | popular
    limit:     int        = Query(default=24, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
):
    """
    Powers the student dashboard's Netflix-style rows. Resolves each active video
    up to its chapter/subject/class/board (via topic OR question link) and attaches
    a real `watch_count` (distinct students who have progress) for popularity rows.
    Redis-cached per (class_num, board, subject, sort, limit) with 10-minute TTL.
    """
    cached = await cache_get_video_feed(class_num, board, subject, sort, limit)
    if cached:
        return cached

    rows = await get_video_feed(db, class_num, board, subject, sort, limit)
    result = {"videos": rows, "count": len(rows)}
    await cache_set_video_feed(class_num, board, subject, sort, limit, result)
    return result


@router.get("/continue-watching", summary="A user's last in-progress (uncompleted) videos, most recent first")
async def continue_watching(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    limit: int = Query(default=12, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    """
    Powers the dashboard 'Jump back in' / Continue Watching sections — real watch
    progress (not bookmarks). Returns uncompleted videos the student has started,
    ordered by most-recently watched, each with subject/chapter and a progress %.
    """
    user_id = str(current_user_id)

    # Redis read-through — skip DB if recently cached
    cached = await cache_get_continue_watching(user_id)
    if cached:
        return cached

    try:
        rows = await get_continue_watching(db, user_id, limit)
    except Exception:
        return {"videos": [], "count": 0}

    result = {"videos": rows, "count": len(rows)}
    await cache_set_continue_watching(user_id, result)
    return result


@router.post("/videos", response_model=VideoResponse, status_code=201, dependencies=[Depends(require_teacher)])
async def create_video(body: VideoCreate, db: AsyncSession = Depends(get_db)):
    result = await ContentService(db).create_video(body)
    await catalog_invalidate("content:videos:")
    return result


@router.get("/videos/by-youtube/{youtube_id}", response_model=VideoResponse)
async def get_video_by_youtube_id(youtube_id: str, db: AsyncSession = Depends(get_db)):
    """Look up a DB video record by its YouTube video ID (used by PYP page to map demo videos)."""
    video = await crud_get_video_by_youtube_id(db, youtube_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


@router.get("/videos/continue-watching", summary="Continue watching (alias, same as /continue-watching)")
async def continue_watching_alias(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    limit: int = Query(default=12, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    return await continue_watching(current_user_id=current_user_id, limit=limit, db=db)


@router.get("/videos/popular", summary="Popular videos feed alias")
async def popular_videos_alias(
    limit: int = Query(default=24, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
):
    return await video_feed(class_num=None, board=None, subject=None, sort="popular", limit=limit, db=db)


async def _fetch_weak_topic_ids(user_id: uuid.UUID) -> list[uuid.UUID]:
    """Real weak-topic signal from analytics_service (quiz performance),
    lowest-accuracy first. Returns [] on any failure or when the student
    has no quiz history yet — callers must fall back to a non-personalized
    feed in that case rather than error."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.ANALYTICS_SERVICE_URL}/api/v1/analytics/internal/student/{user_id}/weak-topics",
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code != 200:
            return []
        topics = resp.json().get("weak_topics", [])
        return [uuid.UUID(t["topic_id"]) for t in topics]
    except Exception:
        return []


@router.get("/videos/recommended", summary="Personalized recommended-videos feed")
async def recommended_videos_alias(
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    limit: int = Query(default=24, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
):
    """Genuinely personalized: pulls the student's real weak topics from
    analytics_service (quiz accuracy < 60%) and returns videos covering
    those topics, skipping ones already completed. Falls back to the
    generic "recent" feed only when there's no weak-topic signal yet (a
    brand-new student, or one who hasn't attempted any quizzes) — never a
    silent, always-identical alias regardless of who's asking."""
    weak_topic_ids = await _fetch_weak_topic_ids(current_user_id)
    if not weak_topic_ids:
        result = await video_feed(class_num=None, board=None, subject=None, sort="recent", limit=limit, db=db)
        result["personalized"] = False
        return result

    completed = await videos_crud.get_completed_video_ids(db, current_user_id)
    rows = await videos_crud.get_videos_by_topic_ids(db, weak_topic_ids, completed, limit)
    if not rows:
        result = await video_feed(class_num=None, board=None, subject=None, sort="recent", limit=limit, db=db)
        result["personalized"] = False
        return result
    return {"videos": rows, "count": len(rows), "personalized": True}


async def _has_active_subscription(user_id: uuid.UUID) -> bool:
    """Ask payment_service whether this user has an active (or parent-
    inherited) subscription. Fails CLOSED (treats as not subscribed) on any
    error, so a premium video is never handed out when entitlement can't be
    confirmed."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.PAYMENT_SERVICE_URL}/api/v1/payments/subscription/status/{user_id}",
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code == 200:
            return bool(resp.json().get("is_active"))
    except Exception:
        pass
    return False


@router.get("/videos/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    video = await _get_video(db, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    # Premium videos require an active subscription — previously the YouTube
    # id (the actual content) was handed to anyone, so premium was cosmetic.
    if video.is_premium and not await _has_active_subscription(current_user_id):
        raise HTTPException(status_code=402, detail="This video is part of a premium plan. Subscribe to watch.")
    return video


async def _check_video_watch_quota(user_id: uuid.UUID) -> None:
    """Admin-configurable daily quota for STARTING a new video (see
    gamification_service's FeatureUsageService) — only called from
    get_video_progress when this is genuinely the user's first-ever open of
    this specific video (both Redis and DB progress lookups miss), so
    re-opening an already-started video to check/resume progress never
    burns quota. Fails open (never blocks) if gamification_service is
    unreachable, same trade-off as ai_service's usage_tracker."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/usage/check-and-log",
                json={"user_id": str(user_id), "feature_key": "video_watch"},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        return
    if resp.status_code == 429:
        # Forward gamification_service's ready-to-show message verbatim —
        # it always sets one on this response, so every gated feature
        # shows the exact same admin-controlled copy, never wording
        # invented per-service.
        detail = resp.json().get("detail", {})
        message = detail.get("message") if isinstance(detail, dict) else None
        raise HTTPException(status_code=429, detail=message)


@router.get("/videos/{video_id}/progress", response_model=VideoProgressResponse)
async def get_video_progress(
    video_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    # 1. Redis read-through (fast path)
    cached = await cache_get_progress(str(current_user_id), str(video_id))
    if cached:
        resp = VideoProgressResponse(**cached)
        # Compute notes_unlocked from cached actual_watched_seconds + video duration
        video = await _get_video(db, video_id)
        if video and video.duration_seconds > 0:
            actual = cached.get("actual_watched_seconds", 0) or 0
            resp.notes_unlocked = (actual / video.duration_seconds) >= 0.70
        return resp

    # 2. DB fallback
    progress = await get_or_create_video_progress(db, current_user_id, video_id)
    if progress is None:
        # Both Redis and DB missed — this user has never opened this video
        # before, so it's a genuine new "video watch" for quota purposes.
        await _check_video_watch_quota(current_user_id)
        return VideoProgressResponse(
            video_id=video_id,
            watched_seconds=0,
            actual_watched_seconds=0,
            is_completed=False,
            completion_percentage=0.0,
            notes_unlocked=False,
        )
    resp = VideoProgressResponse.model_validate(progress)
    video = await _get_video(db, video_id)
    if video and video.duration_seconds > 0:
        resp.notes_unlocked = ((progress.actual_watched_seconds or 0) / video.duration_seconds) >= 0.70
    return resp


async def record_goal_progress(user_id: uuid.UUID, goal_type: str, increment: int) -> None:
    """Best-effort, fire-and-forget POST to gamification_service so "Watch N
    Videos" / "Practice N Minutes" daily goals advance — mirrors quiz_service's
    identical helper for the "quiz"/"questions" goal types. Never raises: a
    missed goal tick must never fail the actual video-progress save."""
    if increment <= 0:
        return
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/goals/progress",
                json={"user_id": str(user_id), "goal_type": goal_type, "increment": increment},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        pass


async def notify_referral_video_watched(user_id: uuid.UUID) -> None:
    """Best-effort, fire-and-forget POST to referral_service on a genuine
    not-completed -> completed transition, so a referred user's "watch a
    video" qualification step re-checks itself server-side (see
    tracking_service.update_qualification — it re-derives the real answer
    from this service's own VideoProgress data, this call is purely the
    trigger to re-check, not a source of truth). A no-op if the user was
    never referred (update_qualification returns {"qualified": False})."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.REFERRAL_SERVICE_URL}/api/v1/referrals/internal/qualify",
                json={"referred_user_id": str(user_id)},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        pass


async def notify_challenge_task_progress(user_id: uuid.UUID, video_id: uuid.UUID) -> None:
    """Best-effort, fire-and-forget POST to gamification_service on a
    genuine not-completed -> completed transition, so any Challenge
    Program task referencing this video_id re-checks itself server-side.
    A no-op if the user isn't enrolled in any challenge referencing this
    video — gamification_service resolves that internally, this call is
    purely the trigger."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/challenge-programs/internal/task-progress",
                json={"user_id": str(user_id), "task_content_ref": str(video_id), "task_type": "video"},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        pass


async def record_daily_activity(user_id: uuid.UUID, study_minutes: int, videos_watched: int) -> None:
    """Best-effort POST to analytics_service's daily_activity upsert — never
    raises; a progress update must succeed even if analytics is down."""
    if study_minutes <= 0 and videos_watched <= 0:
        return
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.ANALYTICS_SERVICE_URL}/api/v1/analytics/internal/activity",
                json={
                    "user_id": str(user_id),
                    "study_minutes": max(0, int(study_minutes)),
                    "videos_watched": max(0, int(videos_watched)),
                },
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        pass


@router.put("/videos/{video_id}/progress", response_model=VideoProgressResponse)
async def update_video_progress(
    video_id: uuid.UUID,
    body: VideoProgressUpdate,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Redis-first progress update.
    All validation & skip-detection runs here; the result is written to Redis only.
    The background worker (progress_worker.py) flushes dirty keys to PostgreSQL every 45 s.
    """
    # 1. Fetch video (needed for duration / pct)
    video = await _get_video(db, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    now      = datetime.now(timezone.utc)
    position = body.position_seconds if body.position_seconds is not None else body.watched_seconds

    # 2. Read previous state from Redis; fall back to DB on cold start
    cached = await cache_get_progress(str(current_user_id), str(video_id))
    if cached is None:
        prev_row = await get_or_create_video_progress(db, current_user_id, video_id)
        if prev_row:
            cached = {
                "video_id":               str(video_id),
                "watched_seconds":        prev_row.watched_seconds or 0,
                "actual_watched_seconds": prev_row.actual_watched_seconds or 0,
                "is_completed":           prev_row.is_completed,
                "completion_percentage":  prev_row.completion_percentage or 0.0,
                "last_position_seconds":  prev_row.last_position_seconds or 0,
                "status":                 prev_row.status or "in_progress",
                "updated_at":             prev_row.updated_at.isoformat() if prev_row.updated_at else now.isoformat(),
            }

    prev_watched    = int((cached or {}).get("watched_seconds", 0)        or 0)
    prev_actual     = int((cached or {}).get("actual_watched_seconds", 0) or 0)
    prev_pos        = int((cached or {}).get("last_position_seconds", 0)  or 0)
    prev_pct        = float((cached or {}).get("completion_percentage", 0.0) or 0.0)
    prev_updated_s  = (cached or {}).get("updated_at")

    # 3. Skip-detection: only credit actual_watched_seconds for real playback
    MAX_SPEED  = 2.0   # fastest player speed
    TOLERANCE  = 5     # seconds of jitter/buffer
    actual_watched = prev_actual
    if prev_updated_s:
        try:
            prev_dt = datetime.fromisoformat(prev_updated_s)
            if prev_dt.tzinfo is None:
                prev_dt = prev_dt.replace(tzinfo=timezone.utc)
            real_elapsed   = max(0.0, (now - prev_dt).total_seconds())
            position_delta = position - prev_pos
            max_creditable = real_elapsed * MAX_SPEED + TOLERANCE
            if 0 < position_delta <= max_creditable:
                credit = min(int(position_delta), int(max_creditable))
                actual_watched = min(video.duration_seconds, prev_actual + credit)
        except Exception:
            pass

    # 4. Derive completion fields — from actual_watched (skip-detection
    # validated real playback), never from the client-reported
    # watched_seconds/is_completed directly. A client claiming
    # is_completed=true or an inflated watched_seconds with no real
    # playback behind it must not be able to fabricate a completion (which
    # would otherwise cascade into fake chapter/subject completion and a
    # real, publicly-verifiable certificate — see notes_unlocked below,
    # which already correctly uses actual_watched for the same reason).
    was_completed = bool((cached or {}).get("is_completed", False))
    new_watched = max(prev_watched, body.watched_seconds)
    real_pct    = min(100.0, (actual_watched / video.duration_seconds * 100)) if video.duration_seconds > 0 else 0.0
    new_pct     = max(prev_pct, real_pct)
    is_done     = new_pct >= 90

    status = "completed" if is_done else (body.status or "in_progress")
    if status == "playing":
        status = "in_progress"

    notes_unlocked = (actual_watched / video.duration_seconds) >= 0.70 if video.duration_seconds > 0 else False

    # 5. Write to Redis only (PostgreSQL write happens in background worker)
    progress_data = {
        "video_id":               str(video_id),
        "watched_seconds":        new_watched,
        "actual_watched_seconds": actual_watched,
        "is_completed":           is_done,
        "completion_percentage":  new_pct,
        "notes_unlocked":         notes_unlocked,
        "last_position_seconds":  position,
        "status":                 status,
        "updated_at":             now.isoformat(),   # used by next call's skip-detection
    }
    await cache_set_progress(str(current_user_id), str(video_id), progress_data)

    # 6. Mark dirty → background worker will flush to PostgreSQL
    await mark_progress_dirty(str(current_user_id), str(video_id))
    await cache_invalidate_continue_watching(str(current_user_id))

    # 7. Daily-goal progress — server-validated, DB-status-driven completion
    # (never trust a client "I finished!" flag): "Watch N Videos" advances
    # once per video on the genuine not-completed → completed transition;
    # "Practice N Minutes" advances by whole minutes of NEWLY credited real
    # playback time (actual_watched_seconds, which already passed the
    # skip-detection check above — a seek/scrub can't fake this).
    if is_done and not was_completed:
        await record_goal_progress(current_user_id, "video", 1)
        await notify_referral_video_watched(current_user_id)
        await notify_challenge_task_progress(current_user_id, video_id)
    new_minutes = actual_watched // 60 - prev_actual // 60
    if new_minutes > 0:
        await record_goal_progress(current_user_id, "practice_minutes", int(new_minutes))
    # Whole-minute boundary crossings rather than round(delta/60) per call:
    # progress pings arrive every few seconds, so per-call rounding would
    # always be 0 and study time would never accrue.
    await record_daily_activity(
        current_user_id,
        study_minutes=int(new_minutes),
        videos_watched=1 if (is_done and not was_completed) else 0,
    )

    return VideoProgressResponse(
        video_id=video_id,
        watched_seconds=new_watched,
        actual_watched_seconds=actual_watched,
        is_completed=is_done,
        completion_percentage=new_pct,
        notes_unlocked=notes_unlocked,
        status=status,
        last_position_seconds=position,
    )


@router.delete("/videos/{video_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_video(video_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    video = await _get_video(db, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    await deactivate_video(db, video)
    await catalog_invalidate("content:videos:")  # same as create — topic video lists are cached


# ── Chapter-level video management ───────────────────────────────────────────

@router.get("/chapters/{chapter_id}/all-videos", response_model=list[VideoResponse])
async def get_chapter_all_videos(chapter_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await ContentService(db).get_chapter_all_videos(chapter_id)


@router.post("/chapters/{chapter_id}/videos", response_model=VideoResponse, status_code=201, dependencies=[Depends(require_teacher)])
async def create_chapter_video(
    chapter_id: uuid.UUID,
    body: ChapterVideoCreate,
    db: AsyncSession = Depends(get_db),
):
    return await ContentService(db).create_chapter_video(chapter_id, body)


@router.post("/seed-demo", status_code=201, dependencies=[Depends(require_admin)])
async def seed_demo(db: AsyncSession = Depends(get_db)):
    """Seed comprehensive demo data: boards, classes, subjects, chapters, topics, videos, PYPs, knowledge articles."""
    return await ContentService(db).seed_demo_catalog()


@router.post("/seed-exercises", dependencies=[Depends(require_admin)])
async def seed_exercise_demo(db: AsyncSession = Depends(get_db)):
    return await ContentService(db).seed_exercise_demo()


@router.post("/seed-unlock", dependencies=[Depends(require_admin)])
async def seed_unlock_for_testing(
    user_id: uuid.UUID = Query(..., description="User UUID to unlock test videos for"),
    db: AsyncSession = Depends(get_db),
):
    """
    Testing helper: marks question-linked videos as completed so quiz unlock logic
    can be verified end-to-end.
      • Real Numbers  → ALL videos complete (chapter quiz + all exercise quizzes unlock)
      • Polynomials   → first exercise videos only (exercise quiz unlocks, chapter locked)
    """
    return await _seed_unlock(db, user_id)
