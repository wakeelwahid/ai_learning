import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, require_admin, require_teacher
from app.crud import pyp_crud
from app.crud.pyp_crud import (
    count_pyp_practice_questions as _count_pyp_qs,
    create_pyp_practice_question as _create_pyp_q,
    delete_pyp_practice_question as _delete_pyp_q,
    get_pyp_practice_question as _get_pyp_q,
    get_pyp_practice_questions as _get_pyp_qs,
    seed_pyp_practice_questions as _seed_pyp_qs,
    update_pyp_practice_question as _update_pyp_q,
)
from app.database.session import get_db
from app.schemas.content import (
    PYPCreate,
    PYPUpdate,
    PypAttemptSubmit,
    PypPracticeQuestionCreate,
)

router = APIRouter(prefix="/content", tags=["content"])


# ─── Previous Year Papers ──────────────────────────────────────────────────────

@router.get("/previous-year-papers")
async def list_pyps(
    board: str | None = Query(default=None),
    class_num: int | None = Query(default=None),
    subject: str | None = Query(default=None),
    year: int | None = Query(default=None),
    exam_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    result = await pyp_crud.list_pyps(db, board, class_num, subject, year, exam_type, limit, offset)
    rows = result["papers"]
    return {
        "papers": [
            {
                "id": str(p.id), "board": p.board, "class_num": p.class_num,
                "subject": p.subject, "year": p.year, "exam_type": p.exam_type,
                "title": p.title, "description": p.description, "file_url": p.file_url,
                "thumbnail_url": p.thumbnail_url, "difficulty": p.difficulty,
                "tags": p.tags, "videos": p.videos or [], "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in rows
        ],
        "total": result["total"],
    }


@router.post("/previous-year-papers", status_code=201, dependencies=[Depends(require_teacher)])
async def create_pyp(body: PYPCreate, db: AsyncSession = Depends(get_db)):
    paper = await pyp_crud.create_pyp(db, body)
    return {"id": str(paper.id), "title": paper.title}


# ── PYP attempts (student, self-only) ─────────────────────────────────────────
# Registered before the /{paper_id} catalog routes so "attempts" is never
# swallowed as a paper id.

def ser_attempt(a) -> dict:
    return {
        "attempt_id": str(a.id), "pyp_id": str(a.pyp_id),
        "subject": a.subject, "board": a.board, "class_num": a.class_num,
        "year": a.year, "exam_type": a.exam_type,
        "questions_total": a.questions_total, "correct_count": a.correct_count,
        "wrong_count": a.wrong_count, "percentage": a.percentage,
        "time_taken_sec": a.time_taken_sec, "status": a.status,
        "started_at": a.started_at.isoformat() if a.started_at else None,
        "completed_at": a.completed_at.isoformat() if a.completed_at else None,
    }


@router.get("/previous-year-papers/attempts/mine", summary="The caller's own PYP attempts")
async def list_my_pyp_attempts(
    limit: int = Query(default=50, ge=1, le=200),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    rows = await pyp_crud.list_pyp_attempts(db, current_user_id, limit)
    return {"attempts": [ser_attempt(a) for a in rows]}


@router.post("/previous-year-papers/{pyp_id}/attempts", status_code=201, summary="Start a PYP attempt")
async def start_pyp_attempt(
    pyp_id: uuid.UUID,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    paper = await pyp_crud.get_pyp(db, pyp_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    attempt = await pyp_crud.create_pyp_attempt(db, current_user_id, paper)
    return ser_attempt(attempt)


@router.patch("/previous-year-papers/attempts/{attempt_id}", summary="Submit a PYP attempt")
async def submit_pyp_attempt(
    attempt_id: uuid.UUID,
    body: PypAttemptSubmit,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    attempt = await pyp_crud.get_pyp_attempt(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Not your attempt")
    attempt = await pyp_crud.submit_pyp_attempt(db, attempt, body.answers, body.time_taken_sec)
    return ser_attempt(attempt)


@router.put("/previous-year-papers/{paper_id}", dependencies=[Depends(require_teacher)])
async def update_pyp(paper_id: uuid.UUID, body: PYPUpdate, db: AsyncSession = Depends(get_db)):
    p = await pyp_crud.get_pyp(db, paper_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paper not found")
    p = await pyp_crud.update_pyp(db, p, body)
    return {"id": str(p.id), "title": p.title}


@router.delete("/previous-year-papers/{paper_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_pyp(paper_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    p = await pyp_crud.get_pyp(db, paper_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paper not found")
    await pyp_crud.deactivate_pyp(db, p)


# ── PYP Practice Questions ────────────────────────────────────────────────────
def ser_pyp_q(q) -> dict:
    opts = {"A": q.option_a, "B": q.option_b}
    if q.option_c: opts["C"] = q.option_c
    if q.option_d: opts["D"] = q.option_d
    return {
        "id": str(q.id),
        "topic_name": q.topic_name,
        "text": q.text,
        "options": opts,
        "correct_option": q.correct_option.upper(),
        "explanation": q.explanation,
        "difficulty": q.difficulty.value if q.difficulty else "medium",
        "sequence": q.sequence,
        "is_active": q.is_active,
    }


@router.get("/pyp-practice-questions")
async def list_pyp_practice_questions(
    topic_name: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List PYP practice questions, optionally filtered by topic_name."""
    rows = await _get_pyp_qs(db, topic_name)
    return [ser_pyp_q(q) for q in rows]


@router.post("/pyp-practice-questions", status_code=201, dependencies=[Depends(require_teacher)])
async def create_pyp_practice_question(body: PypPracticeQuestionCreate, db: AsyncSession = Depends(get_db)):
    """[Admin] Create a PYP practice question."""
    q = await _create_pyp_q(db, body)
    return ser_pyp_q(q)


@router.put("/pyp-practice-questions/{question_id}", dependencies=[Depends(require_teacher)])
async def update_pyp_practice_question(
    question_id: uuid.UUID, body: PypPracticeQuestionCreate, db: AsyncSession = Depends(get_db)
):
    """[Admin] Update a PYP practice question."""
    q = await _get_pyp_q(db, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="PYP practice question not found")
    q = await _update_pyp_q(db, q, body)
    return ser_pyp_q(q)


@router.delete("/pyp-practice-questions/{question_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_pyp_practice_question(question_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """[Admin] Delete a PYP practice question."""
    q = await _get_pyp_q(db, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="PYP practice question not found")
    await _delete_pyp_q(db, q)


@router.post("/pyp-practice-questions/seed", dependencies=[Depends(require_admin)])
async def seed_pyp_practice_questions(db: AsyncSession = Depends(get_db)):
    """[Admin] Seed the DB with the default CBSE/NCERT PYP practice question bank."""
    # Check if already seeded
    count = await _count_pyp_qs(db)
    if count and count > 0:
        return {"message": f"Already seeded ({count} questions exist). Delete all first to re-seed.", "seeded": 0}

    created = await _seed_pyp_qs(db)
    return {"message": f"Seeded {created} PYP practice questions.", "seeded": created}
