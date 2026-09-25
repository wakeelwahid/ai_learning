import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id, require_internal
from app.core.redis import cache_get_progress
from app.crud import progress_crud, pyp_crud, videos_crud
from app.database.session import get_db
from app.schemas.content import StudentLearningResponse, StudentPypResponse

router = APIRouter(prefix="/content", tags=["content"])


async def record_analytics_progress_event(
    db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID,
) -> None:
    """Best-effort, fire-and-forget POST to analytics_service on real video
    completion — same never-raise pattern as record_goal_progress. Resolves
    the video's chapter/subject and, when a chapter link exists, also sends
    the chapter's current completion percentage so analytics_service's
    StudentProgress row stays accurate without content_service needing to
    own quiz-side counters (quiz_service reports those separately)."""
    try:
        resolved = await progress_crud.get_video_chapter_and_subject(db, video_id)
        if not resolved:
            return
        chapter_id, subject_id = resolved
        stats = await progress_crud.get_chapter_progress_stats(db, chapter_id, user_id)
        vid_count = stats["videos_total"]
        vid_done = stats["videos_completed"]
        pct = round((vid_done / vid_count * 100) if vid_count else 0)
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.ANALYTICS_SERVICE_URL}/api/v1/analytics/progress-event",
                json={
                    "user_id": str(user_id),
                    "subject_id": str(subject_id),
                    "chapter_id": str(chapter_id),
                    "video_completed": True,
                    "completion_percentage": pct,
                },
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        pass


# ── User Learning Progress ────────────────────────────────────────────────────
@router.put("/videos/{video_id}/complete", summary="Mark video as completed by user")
async def mark_video_complete(
    video_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    # Security fix: this route must not be an independent way to fabricate
    # completion — it must confirm real watch progress already reported via
    # PUT .../progress (which derives actual_watched_seconds from
    # skip-detection-validated playback, see routes/videos.py), the same way
    # mark_exercise_complete/mark_chapter_complete below already derive
    # their completion from real per-video stats rather than a client flag.
    # Without this check, a bare PUT here (no watch data at all) would mark
    # any video 100% done and cascade into chapter/subject completion and a
    # real certificate.
    video = await videos_crud.get_video(db, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    # Read the same Redis-cached progress PUT .../progress writes (source of
    # truth for the last ~45s until the background worker flushes it to
    # Postgres — see workers/progress_worker.py) before falling back to the
    # DB row, so a user who just finished watching isn't spuriously 409'd.
    cached = await cache_get_progress(str(current_user_id), str(video_id))
    if cached is not None:
        actual_watched = int(cached.get("actual_watched_seconds", 0) or 0)
    else:
        vp = await videos_crud.get_or_create_video_progress(db, current_user_id, video_id)
        actual_watched = (vp.actual_watched_seconds if vp else 0) or 0
    real_pct = (actual_watched / video.duration_seconds * 100) if video.duration_seconds > 0 else 0
    if real_pct < 90:
        raise HTTPException(
            status_code=409,
            detail="Cannot mark this video complete — it hasn't actually been watched yet.",
        )

    # 1. Mark the per-video watch record complete (fetch-or-create)
    await progress_crud.mark_video_progress_complete(db, current_user_id, video_id)

    # 2. Also record in the unified learning-progress table
    result = await progress_crud.upsert_progress_record(db, current_user_id, "video", video_id, "completed")

    # 3. Best-effort: feed the real event to analytics_service
    await record_analytics_progress_event(db, current_user_id, video_id)

    return result


@router.put("/exercises/{exercise_id}/complete", summary="Mark exercise as completed by user")
async def mark_exercise_complete(
    exercise_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    score: Optional[float] = Query(None, ge=0, le=100),
    db: AsyncSession = Depends(get_db),
):
    # Security fix: completion must be derived from real video-watch progress,
    # never trusted from the client — this is the same "unlocked" gate the
    # GET .../my-progress endpoint already uses as the source of truth for
    # this exercise. Without it, a client could PUT complete on any
    # exercise_id (touched or not) and later mint a certificate off it.
    stats = await progress_crud.get_exercise_progress_stats(db, exercise_id, current_user_id)
    if stats["videos_total"] == 0 or stats["videos_completed"] < stats["videos_total"]:
        raise HTTPException(
            status_code=409,
            detail="Cannot mark this exercise complete — not all of its videos have been watched yet.",
        )
    result = await progress_crud.upsert_progress_record(db, current_user_id, "exercise", exercise_id, "completed", score)
    return result


@router.put("/chapters/{chapter_id}/complete", summary="Mark chapter as completed by user")
async def mark_chapter_complete(
    chapter_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    score: Optional[float] = Query(None, ge=0, le=100),
    db: AsyncSession = Depends(get_db),
):
    # Security fix: same server-side derivation as mark_exercise_complete —
    # see that route's comment for the full rationale.
    stats = await progress_crud.get_chapter_progress_stats(db, chapter_id, current_user_id)
    if stats["videos_total"] == 0 or stats["videos_completed"] < stats["videos_total"]:
        raise HTTPException(
            status_code=409,
            detail="Cannot mark this chapter complete — not all of its videos have been watched yet.",
        )
    result = await progress_crud.upsert_progress_record(db, current_user_id, "chapter", chapter_id, "completed", score)
    return result


@router.put("/subjects/{subject_id}/complete", summary="Mark subject/course as completed by user")
async def mark_subject_complete(
    subject_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    score: Optional[float] = Query(None, ge=0, le=100),
    db: AsyncSession = Depends(get_db),
):
    # Security fix: same server-side derivation as mark_exercise_complete —
    # see that route's comment for the full rationale. A subject with zero
    # chapters (stats is None) can never be "completed" either.
    stats = await progress_crud.get_subject_progress_stats(db, subject_id, current_user_id)
    if not stats or stats["videos_total"] == 0 or stats["videos_completed"] < stats["videos_total"]:
        raise HTTPException(
            status_code=409,
            detail="Cannot mark this subject complete — not all of its videos have been watched yet.",
        )
    result = await progress_crud.upsert_progress_record(db, current_user_id, "subject", subject_id, "completed", score)
    return result


@router.get("/chapters/{chapter_id}/my-progress", summary="Get user progress for a chapter")
async def get_chapter_progress(
    chapter_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):

    stats = await progress_crud.get_chapter_progress_stats(db, chapter_id, current_user_id)
    ex_count = stats["exercises_total"]
    ex_done = stats["exercises_completed"]
    vid_count = stats["videos_total"]
    vid_done = stats["videos_completed"]
    ch_progress = stats["progress"]

    pct = round((vid_done / vid_count * 100) if vid_count else 0)
    unlocked = vid_count > 0 and vid_done >= vid_count

    return {
        "chapter_id": str(chapter_id),
        "user_id": str(current_user_id),
        "exercises_total": ex_count,
        "exercises_completed": ex_done,
        "videos_total": vid_count,
        "videos_completed": vid_done,
        "completion_percentage": pct,
        "status": ch_progress.status if ch_progress else ("completed" if pct == 100 else "in_progress" if pct > 0 else "not_started"),
        "score": ch_progress.score if ch_progress else None,
        "unlocked": unlocked,  # chapter practice/quiz unlock once all chapter videos watched
    }


@router.get("/exercises/{exercise_id}/my-progress", summary="Get user progress for an exercise")
async def get_exercise_progress(
    exercise_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):

    stats = await progress_crud.get_exercise_progress_stats(db, exercise_id, current_user_id)
    vid_count = stats["videos_total"]
    vid_done = stats["videos_completed"]
    ex_progress = stats["progress"]

    pct = round((vid_done / vid_count * 100) if vid_count else 0)
    unlocked = vid_count > 0 and vid_done >= vid_count

    return {
        "exercise_id": str(exercise_id),
        "user_id": str(current_user_id),
        "videos_total": vid_count,
        "videos_completed": vid_done,
        "completion_percentage": pct,
        "status": ex_progress.status if ex_progress else ("completed" if pct == 100 else "in_progress" if pct > 0 else "not_started"),
        "score": ex_progress.score if ex_progress else None,
        "unlocked": unlocked,  # exercise practice/quiz unlock once all exercise videos watched
    }


@router.get("/subjects/{subject_id}/my-progress", summary="Get user progress for a subject/course")
async def get_subject_progress(
    subject_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):

    stats = await progress_crud.get_subject_progress_stats(db, subject_id, current_user_id)

    if stats is None:
        return {"subject_id": str(subject_id), "chapters_total": 0, "chapters_completed": 0,
                "completion_percentage": 0, "status": "not_started"}

    ch_count = stats["chapters_total"]
    ch_done = stats["chapters_completed"]
    vid_count = stats["videos_total"]
    vid_done = stats["videos_completed"]
    subj_progress = stats["progress"]

    pct = round((vid_done / vid_count * 100) if vid_count else 0)
    unlocked = vid_count > 0 and vid_done >= vid_count

    return {
        "subject_id": str(subject_id),
        "user_id": str(current_user_id),
        "chapters_total": ch_count,
        "chapters_completed": ch_done,
        "videos_total": vid_count,
        "videos_completed": vid_done,
        "completion_percentage": pct,
        "status": subj_progress.status if subj_progress else ("completed" if pct == 100 else "in_progress" if pct > 0 else "not_started"),
        "score": subj_progress.score if subj_progress else None,
        "unlocked": unlocked,  # course quiz/paper unlock once all subject videos watched
    }


@router.get(
    "/internal/student/{user_id}/learning",
    response_model=StudentLearningResponse,
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
    summary="[Internal] Everything content_service knows about one student's learning",
)
async def internal_student_learning(
    user_id: uuid.UUID,
    days: int = Query(default=90, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Docker-network-only — feeds the parent-facing RAG index. A student with
    no content activity gets zeros and empty lists, never a 404."""
    return {
        "user_id": user_id,
        "videos": await progress_crud.get_student_video_summary(db, user_id, days),
        "completion": await progress_crud.get_student_completion_breakdown(db, user_id),
        "bookmarks": await progress_crud.get_student_bookmarks(db, user_id),
        "certificates": await progress_crud.get_student_certificates(db, user_id),
        "assignments": await progress_crud.get_student_assignment_summary(db, user_id),
    }


@router.get(
    "/internal/student/{user_id}/pyp",
    response_model=StudentPypResponse,
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
    summary="[Internal] One student's previous-year-paper attempts",
)
async def internal_student_pyp(
    user_id: uuid.UUID,
    days: int = Query(default=90, ge=1, le=365),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Docker-network-only — feeds the parent-facing RAG index. A student who
    has never opened a paper gets an empty list and zeroed totals, never 404."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    attempts = await pyp_crud.list_pyp_attempts(db, user_id, limit, since)
    return {
        "user_id": user_id,
        "attempts": [
            {
                "attempt_id": a.id, "pyp_id": a.pyp_id, "subject": a.subject,
                "board": a.board, "class_num": a.class_num, "year": a.year,
                "exam_type": a.exam_type, "questions_total": a.questions_total,
                "correct_count": a.correct_count, "wrong_count": a.wrong_count,
                "percentage": a.percentage, "time_taken_sec": a.time_taken_sec,
                "status": a.status, "started_at": a.started_at,
                "completed_at": a.completed_at,
            }
            for a in attempts
        ],
        "totals": await pyp_crud.get_student_pyp_totals(db, user_id),
    }
