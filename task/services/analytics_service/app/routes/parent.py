import uuid

import httpx
from app.core.dependencies import get_current_user_id_and_role
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import TTL_PARENT_SUMMARY, cache_get, cache_set, parent_summary_key
from app.core.config import settings
from app.crud import activity_crud, aggregate_crud, weak_topic_crud
from app.database.session import get_db
from app.schemas.dashboard import (
    ChildrenSummaryResponse,
    ChildSummaryItem,
    ParentStudentSummaryResponse,
)
from app.services.dashboard_service import AnalyticsService
from app.services.parent_summary import REASON_OVERALL, build_parent_summary

router = APIRouter(prefix="/analytics", tags=["analytics"])

# The only windows the UI exposes as a filter — kept small and fixed so the
# cache key space is bounded (one entry per student per allowed value, not
# one per arbitrary integer). 1 = "Today", 365 = "Last Year".
ALLOWED_SUMMARY_DAYS = (1, 7, 30, 90, 365)


async def verify_parent_link(parent_id: uuid.UUID, child_id: uuid.UUID) -> bool:
    """Call user_service's internal parent-link-check endpoint.

    This is a Docker-network-only, unauthenticated internal call. Fails
    CLOSED (denies access) on any error, non-200 response, or timeout.
    """
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/parent-link-check",
                params={"parent_id": str(parent_id), "child_id": str(child_id)},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
            if resp.status_code == 200:
                return bool(resp.json().get("linked", False))
    except Exception:
        pass
    return False


async def verify_parent_links_batch(parent_id: uuid.UUID, child_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """Batched form of verify_parent_link — one internal call authorizes all
    of a parent's requested children instead of one call per child. Fails
    CLOSED: any error, non-200, or timeout returns an empty set (nothing
    authorized), same posture as the single-child check."""
    if not child_ids:
        return set()
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/parent-link-check-batch",
                json={"parent_id": str(parent_id), "child_ids": [str(c) for c in child_ids]},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
            if resp.status_code == 200:
                return {uuid.UUID(i) for i in resp.json().get("linked_child_ids", [])}
    except Exception:
        pass
    return set()


# ── Parent summary ────────────────────────────────────────────────────────────

# Static reasons for fields that are never computed; per-request reasons for
# fields that turned out null are added by build_parent_summary.
PARENT_SUMMARY_INSUFFICIENT_DATA_FIELDS = {
    "overall_performance": REASON_OVERALL,
}


@router.get("/parent/student/{student_id}/summary", response_model=ParentStudentSummaryResponse)
async def parent_student_summary(
    student_id: uuid.UUID,
    days: int = Query(7, description="Activity window: 1 (today), 7, 30, 90, or 365 days."),
    db: AsyncSession = Depends(get_db),
    current_user: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
) -> ParentStudentSummaryResponse:
    """Full summary for a parent (or admin, viewing any student) covering the
    selected activity window. Cache-first: this is the most expensive read in
    the service (multi-query DB walk + 2 internal HTTP calls), so a 30-min
    Redis cache keyed by (student, days) sits in front of it — invalidated
    on every progress-write event alongside the plain dashboard cache (see
    progress_writer.py), so a fresh quiz/video/login always beats the TTL."""
    current_user_id, role = current_user
    is_admin = role in ("admin", "super_admin")

    if days not in ALLOWED_SUMMARY_DAYS:
        raise HTTPException(status_code=422, detail=f"days must be one of {ALLOWED_SUMMARY_DAYS}")

    if not is_admin:
        linked = await verify_parent_link(current_user_id, student_id)
        if not linked:
            raise HTTPException(
                status_code=403,
                detail="Access denied: no verified parent-child relationship with this student.",
            )

    cache_key = parent_summary_key(str(student_id), days)
    cached = await cache_get(cache_key)
    if cached:
        return ParentStudentSummaryResponse(**cached)

    dashboard = await AnalyticsService.get_student_dashboard(db, student_id)

    # subjects/exam_readiness must scale with the selected days window too —
    # quiz_attempt_log has subject_id + day, so a genuinely windowed
    # per-subject average is possible (unlike StudentProgress, which is an
    # all-time running counter with no date column at all). Falls back to
    # empty when nothing was logged with a subject_id in the window — never
    # silently substitutes the all-time figure, since that would defeat the
    # whole point of the filter.
    subject_scores = await activity_crud.get_windowed_subject_scores(db, student_id, days)
    computed, reasons = await build_parent_summary(db, student_id, dashboard, subject_scores, days=days)

    # total_videos_watched/total_quizzes_completed/avg_quiz_score must scale
    # with the selected days window (the docstring above already promises
    # this) — StudentProgress is an all-time running counter with no date
    # column, so it can't answer "in the last N days". daily_activity and
    # quiz_attempt_log ARE day-bucketed, so pull the windowed totals from
    # there instead of dashboard's all-time sums.
    windowed = await activity_crud.get_windowed_totals(db, student_id, days)
    field_reasons = dict(reasons)
    if windowed["avg_quiz_score"] is None:
        field_reasons["avg_quiz_score"] = f"No quiz attempts logged in the last {days} days."
    if not subject_scores:
        field_reasons["subjects"] = f"No quiz attempts with a recorded subject in the last {days} days."

    response = ParentStudentSummaryResponse(
        total_videos_watched=windowed["videos_watched"],
        total_quizzes_completed=windowed["quizzes_completed"],
        avg_quiz_score=windowed["avg_quiz_score"] or 0.0,
        subjects=subject_scores,
        weak_topics=dashboard.weak_topics,
        insufficient_data_fields={**PARENT_SUMMARY_INSUFFICIENT_DATA_FIELDS, **field_reasons},
        **computed,
    )
    await cache_set(cache_key, response.model_dump(by_alias=True), TTL_PARENT_SUMMARY)
    return response


@router.get("/parent/children-summary", response_model=ChildrenSummaryResponse)
async def parent_children_summary(
    student_ids: str = Query(..., description="Comma-separated student UUIDs"),
    days: int = Query(30, description="Activity window: 1 (today), 7, 30, 90, or 365 days."),
    db: AsyncSession = Depends(get_db),
    current_user: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
) -> ChildrenSummaryResponse:
    """Side-by-side rollup across all of a parent's linked children — total
    videos/quizzes/avg score/attendance/weak-topic-count per child, for the
    "all my kids at a glance" view. Deliberately lighter than the per-child
    /summary endpoint (no trends, no insights) since this is a comparison
    view, not a deep-dive.

    Authorization and every DB read are batched: one internal call verifies
    every requested child belongs to this parent (not one call per child),
    and the 3 backing queries each run once with student_id IN (...) rather
    than once per child — a parent with several children costs the same
    handful of round-trips as a parent with one."""
    current_user_id, role = current_user
    is_admin = role in ("admin", "super_admin")

    if days not in ALLOWED_SUMMARY_DAYS:
        raise HTTPException(status_code=422, detail=f"days must be one of {ALLOWED_SUMMARY_DAYS}")

    try:
        requested_ids = [uuid.UUID(s) for s in student_ids.split(",") if s.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail="student_ids must be a comma-separated list of UUIDs")

    if not requested_ids:
        return ChildrenSummaryResponse(days=days, children=[])

    if is_admin:
        authorized_ids = requested_ids
    else:
        linked = await verify_parent_links_batch(current_user_id, requested_ids)
        authorized_ids = [i for i in requested_ids if i in linked]

    if not authorized_ids:
        return ChildrenSummaryResponse(days=days, children=[])

    # videos/quizzes/avg-score come from the day-bucketed tables (windowed by
    # `days`), not StudentProgress's all-time running counters — same fix as
    # the single-child /summary endpoint. weak_topic_count stays all-time:
    # WeakTopicAnalysis has no date column to window by.
    weak_counts = await weak_topic_crud.get_weak_topic_counts_for_users(db, authorized_ids)
    attendance = await activity_crud.get_attendance_for_users(db, authorized_ids, days)
    windowed = await activity_crud.get_windowed_totals_for_users(db, authorized_ids, days)

    children: list[ChildSummaryItem] = []
    for student_id in authorized_ids:
        w = windowed.get(student_id, {"videos_watched": 0, "quizzes_completed": 0, "avg_quiz_score": None})
        children.append(ChildSummaryItem(
            student_id=str(student_id),
            total_videos_watched=w["videos_watched"],
            total_quizzes_completed=w["quizzes_completed"],
            avg_quiz_score=round(w["avg_quiz_score"], 2) if w["avg_quiz_score"] is not None else 0.0,
            attendance=attendance.get(student_id, 0.0),
            weak_topic_count=weak_counts.get(student_id, 0),
        ))

    return ChildrenSummaryResponse(days=days, children=children)
