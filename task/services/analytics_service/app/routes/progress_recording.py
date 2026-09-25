import uuid

from app.core.dependencies import (
    get_current_user_id,
    get_current_user_id_and_role,
    require_internal,
)
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import TTL_SUBJECT_SCORES, cache_get, cache_set, subject_scores_key
from app.crud import aggregate_crud
from app.database.session import get_db
from app.routes._common import assert_own_data
from app.schemas.dashboard import StudentProgressResponse
from app.schemas.progress import (
    ProgressResponse,
    RecordProgressEventRequest,
    UpdateProgressRequest,
)
from app.schemas.weak_topic import RecordTopicAttemptRequest
from app.services.dashboard_service import AnalyticsService
from app.services.progress_writer import (
    do_record_progress_event,
    do_record_topic_attempt,
    do_update_progress,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── Progress recording ────────────────────────────────────────────────────────

@router.post("/progress", status_code=202, response_model=ProgressResponse)
async def update_progress(
    body: UpdateProgressRequest,
    background_tasks: BackgroundTasks,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> ProgressResponse:
    assert_own_data(current_user_id, body.user_id)
    background_tasks.add_task(do_update_progress, body)
    return ProgressResponse(queued=True)


@router.post("/topic-attempt", status_code=202, response_model=ProgressResponse)
async def record_topic_attempt(
    body: RecordTopicAttemptRequest,
    background_tasks: BackgroundTasks,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> ProgressResponse:
    assert_own_data(current_user_id, body.user_id)
    background_tasks.add_task(do_record_topic_attempt, body)
    return ProgressResponse(queued=True)


@router.post("/internal/topic-attempt", status_code=202, response_model=ProgressResponse,
             dependencies=[Depends(require_internal)])
async def internal_record_topic_attempt(
    body: RecordTopicAttemptRequest,
    background_tasks: BackgroundTasks,
) -> ProgressResponse:
    """Same write as /topic-attempt, without the end-user JWT check — for
    quiz_service to call on every real answer (both submit_quiz and
    batch_submit paths), which has no end-user token in that call's context.
    This is what actually keeps WeakTopicAnalysis live instead of frozen at
    whatever the original seed script wrote."""
    background_tasks.add_task(do_record_topic_attempt, body)
    return ProgressResponse(queued=True)


@router.post("/progress-event", status_code=202, response_model=ProgressResponse,
             dependencies=[Depends(require_internal)])
async def record_progress_event(
    body: RecordProgressEventRequest,
    background_tasks: BackgroundTasks,
) -> ProgressResponse:
    """Additive per-event progress signal — content_service calls this on
    video completion, quiz_service calls it on quiz completion. Internal-only
    (service-to-service, no end-user JWT in context — same pattern as
    gamification_service's /goals/progress). Safe for both callers to call
    independently for the same chapter (see RecordProgressEventRequest)."""
    background_tasks.add_task(do_record_progress_event, body)
    return ProgressResponse(queued=True)


# ── Student progress (chapter-wise) ──────────────────────────────────────────

@router.get("/student/{user_id}/progress", response_model=StudentProgressResponse)
async def student_progress(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
) -> StudentProgressResponse:
    """Chapter-wise progress summary from the analytics DB, including a
    real per-subject breakdown (avg quiz score per subject_id). The dashboard
    half is already cache-first (get_student_dashboard); subject_scores is
    cached here too so this endpoint doesn't fall back to an uncached GROUP
    BY on every call — invalidated alongside the dashboard cache on every
    progress-write event (see progress_writer.py)."""
    current_user_id, role = current_user
    assert_own_data(current_user_id, user_id, role)
    dashboard = await AnalyticsService.get_student_dashboard(db, user_id)

    cache_key = subject_scores_key(str(user_id))
    subject_scores = await cache_get(cache_key)
    if subject_scores is None:
        subject_scores = await aggregate_crud.get_subject_scores(db, user_id)
        await cache_set(cache_key, subject_scores, TTL_SUBJECT_SCORES)

    return StudentProgressResponse(
        user_id=str(user_id),
        total_videos_watched=dashboard.total_videos_watched,
        total_quizzes_completed=dashboard.total_quizzes_completed,
        avg_quiz_score=round(dashboard.avg_quiz_score, 1),
        subjects=subject_scores,
        weak_topics=dashboard.weak_topics,
    )


# ── Topic attempt recording (alias) ──────────────────────────────────────────

@router.post("/topics/record", status_code=202, response_model=ProgressResponse)
async def record_topic_attempt_alias(
    body: RecordTopicAttemptRequest,
    background_tasks: BackgroundTasks,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> ProgressResponse:
    """Alias for /topic-attempt — matches gateway route /topics/record."""
    assert_own_data(current_user_id, body.user_id)
    background_tasks.add_task(do_record_topic_attempt, body)
    return ProgressResponse(queued=True)
