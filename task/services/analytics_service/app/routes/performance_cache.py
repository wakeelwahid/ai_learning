import uuid

from app.core.dependencies import get_current_user_id_and_role, require_admin
from fastapi import APIRouter, Depends

from app.core.cache import (
    TTL_PERFORMANCE, TTL_RECOMMENDED,
    cache_get, cache_set,
    performance_key, recommended_key,
)
from app.routes._common import assert_own_data
from app.schemas.performance_cache import (
    PerformanceUpdateRequest,
    RecommendedQuestionsResponse,
    RecommendedQuestionsUpdateRequest,
    RecommendedUpdatedResponse,
    SubjectPerformanceResponse,
    UpdatedResponse,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── Student performance cache ─────────────────────────────────────────────────

@router.get("/student/{user_id}/performance", response_model=SubjectPerformanceResponse)
async def student_performance(
    user_id: uuid.UUID,
    current_user: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
) -> SubjectPerformanceResponse:
    """
    Per-subject performance from Redis.
    Updated by quiz_service after every batch-submit via the shared Redis instance.
    """
    # Phase 11: IDOR check — user_id must be a real UUID (enforced by the path
    # type itself, via app.middleware.error_handlers' consistent 422) and must match the caller.
    current_user_id, role = current_user
    assert_own_data(current_user_id, user_id, role)
    data = await cache_get(performance_key(str(user_id)))
    return SubjectPerformanceResponse(**data) if data else SubjectPerformanceResponse()


@router.get("/student/{user_id}/subjects", response_model=SubjectPerformanceResponse)
async def student_subjects(
    user_id: uuid.UUID,
    current_user: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
) -> SubjectPerformanceResponse:
    """Alias for /performance — returns per-subject accuracy data."""
    current_user_id, role = current_user
    assert_own_data(current_user_id, user_id, role)
    data = await cache_get(performance_key(str(user_id)))
    return SubjectPerformanceResponse(**data) if data else SubjectPerformanceResponse()


@router.put("/student/{user_id}/performance", response_model=UpdatedResponse, dependencies=[Depends(require_admin)])
async def update_student_performance(user_id: uuid.UUID, body: PerformanceUpdateRequest) -> UpdatedResponse:
    """Allow admin tools to push performance data into this cache (admin-only)."""
    await cache_set(performance_key(str(user_id)), body.model_dump(), TTL_PERFORMANCE)
    return UpdatedResponse(updated=True)


# ── Recommended questions cache ───────────────────────────────────────────────

@router.get("/student/{user_id}/recommended-questions", response_model=RecommendedQuestionsResponse)
async def recommended_questions(
    user_id: uuid.UUID,
    current_user: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
) -> RecommendedQuestionsResponse:
    """
    AI-generated recommended question IDs for a student.
    Key: student:{id}:recommended  (populated by ai_service or quiz_service).
    """
    current_user_id, role = current_user
    assert_own_data(current_user_id, user_id, role)
    data = await cache_get(recommended_key(str(user_id)))
    return RecommendedQuestionsResponse(recommended_questions=data or [])


@router.put("/student/{user_id}/recommended-questions", response_model=RecommendedUpdatedResponse,
            dependencies=[Depends(require_admin)])
async def update_recommended(user_id: uuid.UUID, body: RecommendedQuestionsUpdateRequest) -> RecommendedUpdatedResponse:
    """Store recommended question list (called by ai_service after generating recommendations)."""
    questions = [str(q) for q in body.questions]
    await cache_set(recommended_key(str(user_id)), questions, TTL_RECOMMENDED)
    return RecommendedUpdatedResponse(updated=True, count=len(questions))
