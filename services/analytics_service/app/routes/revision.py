import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id, require_internal
from app.crud import revision_crud
from app.database.session import get_db
from app.schemas.revision import (
    RevisionSessionResponse,
    RevisionSessionTotals,
    StartRevisionSessionRequest,
    StudentRevisionSessionsResponse,
    UpdateRevisionSessionRequest,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── Revision sessions (student, self-only) ────────────────────────────────────

@router.post("/revision/sessions", response_model=RevisionSessionResponse, status_code=201)
async def start_revision_session(
    body: StartRevisionSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> RevisionSessionResponse:
    """Open a revision sitting. The row is always written for the caller —
    a user_id in the body is never trusted (and the schema has none)."""
    row = await revision_crud.create(
        db, current_user_id, body.topic_id, body.subject_id, body.source
    )
    return RevisionSessionResponse(**revision_crud.session_dict(row))


@router.patch("/revision/sessions/{session_id}", response_model=RevisionSessionResponse)
async def update_revision_session(
    session_id: uuid.UUID,
    body: UpdateRevisionSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> RevisionSessionResponse:
    """Close out a sitting with elapsed seconds. Same shape as the study-time
    heartbeat: the client sends total elapsed, the server just stores it."""
    row = await revision_crud.get(db, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Revision session not found")
    if row.user_id != current_user_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied: you can only update your own revision sessions.",
        )
    row = await revision_crud.finish(db, row, body.duration_sec, body.is_completed)
    if body.is_completed:
        await _notify_challenge_task_progress(current_user_id, row.topic_id)
    return RevisionSessionResponse(**revision_crud.session_dict(row))


async def _notify_challenge_task_progress(user_id: uuid.UUID, topic_id: uuid.UUID | None) -> None:
    """Best-effort, fire-and-forget POST to gamification_service on a real
    revision-session completion, so any Challenge Program study_session
    task re-checks itself server-side. task_content_ref carries the
    topic_id (or empty string for an unscoped task) since, unlike video/
    quiz/battle, a revision session doesn't pre-exist for an admin to
    reference — the check is "any completed session since joining,
    optionally topic-scoped" (see revision_crud.has_completed_session_since)."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/challenge-programs/internal/task-progress",
                json={
                    "user_id": str(user_id),
                    "task_content_ref": str(topic_id) if topic_id else "",
                    "task_type": "study_session",
                },
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        pass


@router.get("/revision/sessions/mine", response_model=list[RevisionSessionResponse])
async def my_revision_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> list[RevisionSessionResponse]:
    rows = await revision_crud.list_for_user(db, current_user_id, limit=limit)
    return [RevisionSessionResponse(**revision_crud.session_dict(r)) for r in rows]


# ── Internal ──────────────────────────────────────────────────────────────────

@router.get("/internal/student/{user_id}/revision", response_model=StudentRevisionSessionsResponse,
            dependencies=[Depends(require_internal)], include_in_schema=False)
async def internal_student_revision(
    user_id: uuid.UUID,
    days: int = Query(default=90, ge=1, le=366),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> StudentRevisionSessionsResponse:
    """Revision sessions + window totals for ai_service's parent-RAG indexer.
    200 with empty sessions and zeroed totals when the student has none.
    The awaits are sequential on purpose: one AsyncSession must not serve
    overlapping queries."""
    rows = await revision_crud.list_for_user(db, user_id, days=days, limit=limit)
    totals = await revision_crud.totals_for_user(db, user_id, days)

    return StudentRevisionSessionsResponse(
        user_id=str(user_id),
        sessions=[RevisionSessionResponse(**revision_crud.session_dict(r)) for r in rows],
        totals=RevisionSessionTotals(**totals),
    )


@router.get(
    "/internal/revision/completed/{user_id}",
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
)
async def internal_has_completed_revision_session(
    user_id: uuid.UUID,
    since: str = Query(..., description="ISO-8601 timestamp — only sessions started at/after this count"),
    topic_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Has this user completed a (optionally topic-scoped)
    revision session since `since`? gamification_service's Challenge
    Programs feature calls this to verify a study_session-type challenge
    task server-side."""
    since_dt = datetime.fromisoformat(since)
    if since_dt.tzinfo is None:
        since_dt = since_dt.replace(tzinfo=timezone.utc)
    completed = await revision_crud.has_completed_session_since(db, user_id, since_dt, topic_id)
    return {"completed": completed}
