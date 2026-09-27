"""Student attempts at generated papers — the write path that gives the
parent-facing RAG something to report on."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, require_internal
from app.crud import ai_crud
from app.database.session import get_db
from app.models.paper_attempt import PaperAttempt
from app.schemas.ai import PaperAttemptResponse, PaperAttemptSubmit
from app.services import paper_grader

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/papers/{paper_id}/attempts", response_model=PaperAttemptResponse, status_code=201,
             summary="Start an attempt at a generated paper")
async def start_attempt(
    paper_id: uuid.UUID,
    user_id:  uuid.UUID = Depends(get_current_user_id),
    db:       AsyncSession = Depends(get_db),
):
    """The attempt always belongs to the authenticated caller — no user_id is
    accepted from the body. Curriculum fields are denormalised from the paper
    so the history survives the paper being deleted."""
    paper = await ai_crud.get_paper_by_id(db, paper_id)
    if not paper or paper.status != "PUBLISHED":
        raise HTTPException(status_code=404, detail="Paper not found")

    return await ai_crud.create_attempt(db, PaperAttempt(
        user_id=user_id,
        paper_id=paper.id,
        paper_type=paper.paper_type,
        subject=paper.subject,
        chapter=paper.chapter,
        board=paper.board,
        class_num=paper.class_num,
        total_marks=paper.total_marks,
        status="in_progress",
        started_at=datetime.now(timezone.utc),
    ))


@router.patch("/papers/attempts/{attempt_id}", response_model=PaperAttemptResponse,
              summary="Submit an attempt — graded server-side from the paper's answer key")
async def submit_attempt(
    attempt_id: uuid.UUID,
    body:       PaperAttemptSubmit,
    user_id:    uuid.UUID = Depends(get_current_user_id),
    db:         AsyncSession = Depends(get_db),
):
    attempt = await ai_crud.get_attempt_by_id(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your attempt")
    if attempt.status == "completed":
        raise HTTPException(status_code=409, detail="Attempt already submitted")

    paper = await ai_crud.get_paper_by_id(db, attempt.paper_id)
    correct, wrong, gradable = paper_grader.grade(paper.content if paper else None, body.answers)

    if gradable:
        attempt.correct_count = correct
        attempt.wrong_count = wrong
        attempt.score = float(correct)
        attempt.percentage = round(correct * 100 / gradable, 2)
    elif body.score is not None:
        # No machine-checkable key in the paper — the client's score is all we have.
        attempt.score = body.score
        total = attempt.total_marks or 0
        attempt.percentage = round(body.score * 100 / total, 2) if total else 0.0

    attempt.answers = body.answers
    attempt.time_taken_sec = body.time_taken_sec
    attempt.status = "completed"
    attempt.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(attempt)
    return attempt


@router.get("/papers/attempts/mine", response_model=list[PaperAttemptResponse],
            summary="The caller's own paper attempts")
async def my_attempts(
    limit:   int = Query(default=50, ge=1, le=200),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db:      AsyncSession = Depends(get_db),
):
    return await ai_crud.get_user_attempts(db, user_id, limit)


@router.get(
    "/internal/student/{user_id}/papers",
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
    summary="[Internal] One student's generated-paper attempts and totals",
)
async def internal_student_papers(
    user_id: uuid.UUID,
    days:    int = Query(default=90, ge=1, le=365),
    limit:   int = Query(default=50, ge=1, le=200),
    db:      AsyncSession = Depends(get_db),
):
    """Docker-network-only — feeds the parent-facing RAG index. A student with
    no attempts gets zeros and an empty list, never a 404."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    attempts = await ai_crud.get_user_attempts(db, user_id, limit, since=since)
    count, avg, best = await ai_crud.get_attempt_totals(db, user_id, since)
    return {
        "user_id": user_id,
        "attempts": [PaperAttemptResponse.model_validate(a) for a in attempts],
        "totals": {
            "attempts": count,
            "avg_percentage": round(avg, 2) if avg is not None else None,
            "best_percentage": round(best, 2) if best is not None else None,
            "generated_count": await ai_crud.count_papers_generated(db, user_id),
        },
    }
