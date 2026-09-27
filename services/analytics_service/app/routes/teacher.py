import uuid

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import TTL_ADMIN, cache_get, cache_set, teacher_cohort_key
from app.core.config import settings
from app.core.dependencies import require_teacher
from app.crud import aggregate_crud
from app.database.session import get_db
from app.schemas.dashboard import TeacherCohortResponse

router = APIRouter(prefix="/analytics", tags=["analytics"])


async def get_students_by_curriculum(board: str, class_number: int) -> list[uuid.UUID]:
    """Ask user_service for every student profile set to this board & class.
    Fails closed (empty cohort) on any error — a teacher seeing "no data yet"
    for a genuinely-populated class is a much smaller problem than one
    service outage silently mixing in the wrong students."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/students-by-curriculum",
                params={"board": board, "class_number": class_number},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code == 200:
            return [uuid.UUID(u) for u in resp.json().get("user_ids", [])]
    except Exception:
        pass
    return []


@router.get("/teacher/cohort", response_model=TeacherCohortResponse)
async def teacher_cohort_overview(
    board: str = Query(..., description="e.g. CBSE, ICSE"),
    class_number: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    _teacher_id: uuid.UUID = Depends(require_teacher),
) -> TeacherCohortResponse:
    """Aggregate performance view for every student in a given board+class —
    the closest thing to a "classroom" this platform has, since no
    teacher-student roster exists. No individual student is identifiable in
    the response.

    Cache-aside, 10-min TTL keyed by (board, class): a cohort's aggregate
    doesn't change fast enough to need a live query on every page load, and
    this is the most expensive query in the service (3 full-cohort
    aggregations per request)."""
    cache_key = teacher_cohort_key(board, class_number)
    cached = await cache_get(cache_key)
    if cached:
        return TeacherCohortResponse(**cached)

    user_ids = await get_students_by_curriculum(board, class_number)

    overview = await aggregate_crud.get_cohort_overview(db, user_ids)
    subjects = await aggregate_crud.get_cohort_subject_scores(db, user_ids)
    weak_topics = await aggregate_crud.get_cohort_weak_topics(db, user_ids)

    response = TeacherCohortResponse(
        board=board,
        class_number=class_number,
        subjects=subjects,
        weak_topics=weak_topics,
        **overview,
    )
    await cache_set(cache_key, response.model_dump(), TTL_ADMIN)
    return response
