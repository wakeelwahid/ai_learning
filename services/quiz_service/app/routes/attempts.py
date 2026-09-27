import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id, get_current_user_id_and_role, require_internal
from app.crud import attempt_crud
from app.database.session import get_db
from app.schemas.attempt import (
    AttemptResponse,
    BatchSubmitRequest,
    BatchSubmitResponse,
    StartAttemptRequest,
    StudentAttemptItem,
    StudentAttemptsResponse,
    StudentAttemptTotals,
    StudentSubjectStats,
    SubmitAnswerRequest,
    SubmitQuizRequest,
)
from app.services.attempt_state_service import AttemptStateService
from app.services.quiz_service import AttemptService

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


@router.get("/attempts/user/{user_id}", summary="Get all quiz attempts for a user")
async def get_user_attempts(
    user_id: uuid.UUID,
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    # IDOR fix: the {user_id} path param is ignored for filtering — a caller can
    # only ever list their own attempts, regardless of what id is in the URL.
    return await attempt_crud.get_user_attempts(db, caller_id, limit=limit)


@router.get(
    "/attempts/internal/completed/{user_id}",
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
    summary="[Internal] Has this user completed at least one quiz?",
)
async def internal_has_completed_quiz(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Docker-network-only — referral_service's qualification check calls
    this instead of trusting a client-asserted "quiz_completed" flag."""
    return {"completed": await attempt_crud.has_completed_any_quiz(db, user_id)}


@router.get(
    "/attempts/internal/completed/{user_id}/{quiz_id}",
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
    summary="[Internal] Has this user completed THIS specific quiz?",
)
async def internal_has_completed_specific_quiz(
    user_id: uuid.UUID, quiz_id: uuid.UUID, db: AsyncSession = Depends(get_db),
):
    """Docker-network-only — gamification_service's Challenge Programs
    feature calls this to verify a quiz/practice-type challenge task
    server-side."""
    return {"completed": await attempt_crud.has_completed_specific_quiz(db, user_id, quiz_id)}


@router.get(
    "/internal/student/{user_id}/attempts",
    response_model=StudentAttemptsResponse,
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
    summary="[Internal] A student's completed quiz attempts, with rollups",
)
async def internal_student_attempts(
    user_id: uuid.UUID,
    days: int = Query(default=90, ge=1, le=365),
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Docker-network-only — ai_service's parent RAG indexer reads a student's
    quiz history from here. Always 200: a student with no attempts gets empty
    lists and zeroed totals, never a 404."""
    rows = await attempt_crud.get_completed_attempts_with_quiz(db, user_id, days, limit)
    counts = await attempt_crud.get_answer_counts_by_attempt(db, [a.id for a, _ in rows])

    attempts = [
        StudentAttemptItem(
            attempt_id=attempt.id,
            quiz_id=quiz.id,
            quiz_title=quiz.title,
            subject_name=quiz.subject_name,
            chapter_name=quiz.chapter_name,
            quiz_type=quiz.quiz_type.value if quiz.quiz_type else None,
            board=quiz.board,
            class_num=quiz.class_num,
            score=attempt.score,
            total_marks=attempt.total_marks,
            percentage=attempt.percentage,
            time_taken_seconds=attempt.time_taken_seconds,
            completed_at=attempt.completed_at,
            correct_count=counts.get(attempt.id, (0, 0))[0],
            wrong_count=counts.get(attempt.id, (0, 0))[1],
        )
        for attempt, quiz in rows
    ]

    by_subject = [
        StudentSubjectStats(
            subject_name=name,
            attempts=n,
            avg_percentage=round(avg, 2),
            best_percentage=best,
            worst_percentage=worst,
        )
        for name, n, avg, best, worst in await attempt_crud.get_subject_stats(db, user_id, days)
    ]

    n, avg, total_time, first_at, last_at = await attempt_crud.get_attempt_totals(db, user_id, days)
    return StudentAttemptsResponse(
        user_id=user_id,
        attempts=attempts,
        by_subject=by_subject,
        totals=StudentAttemptTotals(
            attempts=n,
            avg_percentage=round(avg or 0.0, 2),
            total_time_seconds=total_time or 0,
            first_attempt_at=first_at,
            last_attempt_at=last_at,
        ),
    )


# ── Attempt routes (all prefixed with /attempts — safe before /{quiz_id}) ────

async def _check_quiz_attempt_quota(user_id: uuid.UUID) -> None:
    """Admin-configurable daily quota for starting a quiz attempt (see
    gamification_service's FeatureUsageService). Fails open (never blocks)
    if gamification_service is unreachable — same trade-off used by
    ai_service's usage_tracker and content_service's video-watch check."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/usage/check-and-log",
                json={"user_id": str(user_id), "feature_key": "quiz_attempt"},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        return
    if resp.status_code == 429:
        # Forward gamification_service's ready-to-show message verbatim —
        # never invent wording here.
        detail = resp.json().get("detail", {})
        message = detail.get("message") if isinstance(detail, dict) else None
        raise HTTPException(status_code=429, detail=message)


@router.post("/attempts/start", response_model=AttemptResponse, status_code=201)
async def start_attempt(
    body: StartAttemptRequest,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    # IDOR fix: the attempt owner is always the caller (from JWT), never a
    # client-supplied user_id.
    await _check_quiz_attempt_quota(caller_id)
    service = AttemptService(db)
    attempt = await service.start_attempt(body.quiz_id, caller_id)
    await db.commit()
    return attempt


@router.post("/attempts/answer")
async def submit_answer(
    body: SubmitAnswerRequest,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    """Single-answer submit — answer validated via Redis (fallback: PostgreSQL)."""
    service = AttemptService(db)
    answer  = await service.submit_answer(body.attempt_id, body.question_id, body.user_answer, caller_id)
    await db.commit()
    return {"status": "saved", "is_correct": answer.is_correct}


@router.post("/attempts/batch-submit", response_model=BatchSubmitResponse, status_code=201)
async def batch_submit(
    body: BatchSubmitRequest,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Redis-first full submission — all answers evaluated in one call.
    Answers validated against Redis question cache; leaderboard + weak topics updated atomically.
    """
    # IDOR fix: user_id is always the caller (from JWT), never the client-supplied
    # body.user_id — AttemptService.batch_submit verifies attempt ownership against it.
    service = AttemptService(db)
    result  = await service.batch_submit(
        attempt_id=body.attempt_id,
        user_id=caller_id,
        answers=body.answers,
        class_num=body.class_num,
    )
    await db.commit()
    return result


@router.post("/attempts/submit")
async def submit_quiz(
    body: SubmitQuizRequest,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    """Finalize quiz attempt. Returns enriched result with passed, answered_count,
    unanswered_count, weak_topics, and time_taken_seconds."""
    service = AttemptService(db)
    result = await service.submit_quiz(body.attempt_id, caller_id)
    await db.commit()
    return result


@router.put("/attempts/{attempt_id}/state")
async def save_attempt_state(
    attempt_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    """Save quiz-in-progress state to Redis (pause/resume support).

    Body: {answers: {}, current_q: int, marked_for_review: [], time_per_q: {}}
    (left as a free-form dict — it's an opaque Redis-only state blob, never
    mapped onto DB columns, so it isn't a mass-assignment risk like the old
    admin_update_quiz `dict` body was.)
    TTL: 24 hours

    IDOR fix: the Redis key is keyed on the caller's JWT id, never a
    client-supplied user_id query param.
    """
    service = AttemptStateService()
    ok = await service.save_attempt_state(str(attempt_id), str(caller_id), body)
    return {"saved": ok, "attempt_id": str(attempt_id)}


@router.get("/attempts/{attempt_id}/state")
async def get_attempt_state(
    attempt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    """Retrieve saved quiz state from Redis (resume check).

    IDOR fix: the Redis key is keyed on the caller's JWT id, never a
    client-supplied user_id query param.
    """
    service = AttemptStateService()
    state = await service.get_attempt_state(str(attempt_id), str(caller_id))
    if state is None:
        raise HTTPException(status_code=404, detail="No saved state found for this attempt")
    return {"attempt_id": str(attempt_id), "state": state}


@router.get("/attempts/{attempt_id}", response_model=AttemptResponse)
async def get_attempt(
    attempt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    caller: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
):
    attempt = await attempt_crud.get_attempt(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    # IDOR fix: only the attempt's owner (or an admin) may view it.
    caller_id, role = caller
    if attempt.user_id != caller_id and role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized to view this attempt")
    # Count answered (non-null user_answer) vs the quiz's real total question count
    answered, unanswered = await attempt_crud.get_attempt_answer_counts(db, attempt_id, attempt.quiz_id)
    # Build response with computed counts
    return AttemptResponse(
        id=attempt.id,
        quiz_id=attempt.quiz_id,
        user_id=attempt.user_id,
        status=attempt.status,
        score=attempt.score,
        total_marks=attempt.total_marks,
        percentage=attempt.percentage,
        passed=attempt.percentage >= 40.0,
        answered_count=answered,
        unanswered_count=unanswered,
        weak_topics=[],
        time_taken_seconds=attempt.time_taken_seconds,
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
    )
