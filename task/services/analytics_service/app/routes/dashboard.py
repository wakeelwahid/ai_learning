import asyncio
import uuid

import httpx
from app.core.dependencies import (
    get_current_user_id_and_role,
    require_internal,
)
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import TTL_WEEKLY_SUMMARY, cache_get, cache_set, weekly_summary_key
from app.core.config import settings
from app.crud import activity_crud, aggregate_crud
from app.database.session import get_db
from app.routes._common import assert_own_data
from app.schemas.activity import ActivityDayResponse
from app.schemas.dashboard import (
    DashboardResponse,
    RevisionResponse,
    StudentFullResponse,
    StudentProgressResponse,
    WeeklySummaryResponse,
)
from app.schemas.weak_topic import WeakTopicsResponse
from app.services.dashboard_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── Student dashboard ─────────────────────────────────────────────────────────

@router.get("/student/{user_id}/dashboard", response_model=DashboardResponse)
async def student_dashboard(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
) -> DashboardResponse:
    """Cache-first dashboard — serves from Redis within 30-min TTL."""
    current_user_id, role = current_user
    assert_own_data(current_user_id, user_id, role)
    return await AnalyticsService.get_student_dashboard(db, user_id)


@router.get("/student/{user_id}/revision", response_model=RevisionResponse)
async def student_revision(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
) -> RevisionResponse:
    current_user_id, role = current_user
    assert_own_data(current_user_id, user_id, role)
    dashboard = await AnalyticsService.get_student_dashboard(db, user_id)
    return RevisionResponse(
        weak_topics=dashboard.weak_topics,
        total_videos_watched=dashboard.total_videos_watched,
        total_quizzes_completed=dashboard.total_quizzes_completed,
    )


@router.get("/student/{user_id}/weak-topics", response_model=WeakTopicsResponse)
async def student_weak_topics(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
) -> WeakTopicsResponse:
    current_user_id, role = current_user
    assert_own_data(current_user_id, user_id, role)
    dashboard = await AnalyticsService.get_student_dashboard(db, user_id)
    return WeakTopicsResponse(weak_topics=dashboard.weak_topics)


@router.get("/internal/student/{user_id}/weak-topics", response_model=WeakTopicsResponse,
            dependencies=[Depends(require_internal)])
async def internal_student_weak_topics(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> WeakTopicsResponse:
    """Same data as the student-facing route above, without the JWT/
    assert_own_data check — for content_service's personalized video
    recommendations (server-to-service, no end-user token in that call's
    context, same pattern as /progress-event)."""
    dashboard = await AnalyticsService.get_student_dashboard(db, user_id)
    return WeakTopicsResponse(weak_topics=dashboard.weak_topics)


@router.get("/internal/student/{user_id}/full", response_model=StudentFullResponse,
            dependencies=[Depends(require_internal)], include_in_schema=False)
async def internal_student_full(
    user_id: uuid.UUID,
    days: int = Query(default=90, ge=1, le=366),
    db: AsyncSession = Depends(get_db),
) -> StudentFullResponse:
    """Dashboard + daily activity + weak topics + chapter progress in one
    call, for ai_service's parent-RAG indexer. Pure fan-in over the routes
    above — no logic of its own. Returns 200 with zeroed/empty sections for a
    student with no data. The awaits are sequential on purpose: one
    AsyncSession must not serve overlapping queries."""
    dashboard = await AnalyticsService.get_student_dashboard(db, user_id)
    rows = await activity_crud.get_range(db, user_id, days)
    subject_scores = await aggregate_crud.get_subject_scores(db, user_id)

    return StudentFullResponse(
        user_id=str(user_id),
        dashboard=dashboard,
        activity_range=[ActivityDayResponse(**activity_crud.activity_row_dict(r)) for r in rows],
        weak_topics=dashboard.weak_topics,
        progress=StudentProgressResponse(
            user_id=str(user_id),
            total_videos_watched=dashboard.total_videos_watched,
            total_quizzes_completed=dashboard.total_quizzes_completed,
            avg_quiz_score=round(dashboard.avg_quiz_score, 1),
            subjects=subject_scores,
            weak_topics=dashboard.weak_topics,
        ),
    )


@router.get("/student/{user_id}/weekly-summary", response_model=WeeklySummaryResponse)
async def student_weekly_summary(
    user_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
) -> WeeklySummaryResponse:
    """Weekly summary — alias to dashboard with week-relative field names,
    plus real total_xp/level/streak/rank pulled from gamification_service
    (previously hardcoded to 0). Note the field name `xp_earned` is
    historical — it actually reports the student's current total_xp, not
    XP earned in the last 7 days specifically (no weekly XP delta is tracked
    anywhere), so it's renamed here to `total_xp` with `xp_earned` kept as a
    deprecated alias for existing callers."""
    current_user_id, role = current_user
    assert_own_data(current_user_id, user_id, role)

    cache_key = weekly_summary_key(str(user_id))
    cached = await cache_get(cache_key)
    if cached:
        return WeeklySummaryResponse(**cached)

    dash = await AnalyticsService.get_student_dashboard(db, user_id)

    auth_header = request.headers.get("authorization", "")
    total_xp = level = streak = rank = None
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            profile_resp, rank_resp = await asyncio.gather(
                client.get(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/profile/{user_id}",
                    headers={"Authorization": auth_header},
                ),
                client.get(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/rank-unlock/{user_id}",
                    headers={"Authorization": auth_header},
                ),
            )
        if profile_resp.status_code == 200:
            profile = profile_resp.json()
            total_xp = profile.get("xp", {}).get("total_xp")
            level = profile.get("xp", {}).get("level")
            streak = profile.get("streak", {}).get("current")
        if rank_resp.status_code == 200:
            rank = rank_resp.json().get("rank")
    except httpx.RequestError:
        pass  # gamification_service unreachable — report the gaps below, don't fail the whole summary

    response = WeeklySummaryResponse(
        videos_watched=dash.total_videos_watched,
        quizzes_completed=dash.total_quizzes_completed,
        avg_score=round(dash.avg_quiz_score, 1),
        total_xp=total_xp,
        xp_earned=total_xp,  # deprecated alias, see docstring
        level=level,
        rank=rank,
        streak=streak,
        weak_topics=dash.weak_topics,
    )
    # Short TTL (5 min) — this embeds a live gamification_service snapshot,
    # not just analytics_service's own data, so it can't ride the 30-min
    # dashboard TTL without going stale on XP/streak/rank for too long.
    await cache_set(cache_key, response.model_dump(), TTL_WEEKLY_SUMMARY)
    return response
