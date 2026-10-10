import random
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import bearer, get_current_user_id, require_admin, verify_token
from app.core.redis import get_redis
from app.crud import ai_crud
from app.database.session import get_db
from app.models.question_item import QuestionItem
from app.schemas.ai import PaperBulkCreate, PaperCreate, PaperGenerateRequest, PaperResponse
from app.services import paper_cache, question_cache, usage_tracker
from app.tasks.generation import generate_paper_task

router = APIRouter(prefix="/ai", tags=["ai"])


PAPER_TYPE_TO_QUESTION_FEATURE = {
    "quiz_paper":      "quiz",
    "custom":          "custom",
    "practice_paper":  "questions",
    "mock_test":       "questions",
    "revision_paper":  "questions",
}


async def extract_and_save_questions(db: AsyncSession, paper) -> None:
    """
    Extract flat question rows from a PUBLISHED+verified GeneratedPaper and
    insert them into question_items, keyed by feature so each type stays separate.
    Skips if no sections/questions in content.
    """
    feature = PAPER_TYPE_TO_QUESTION_FEATURE.get(paper.paper_type or "", "questions")
    sections = (paper.content or {}).get("sections", [])
    rows = []
    for sec in sections:
        for q in sec.get("questions", []):
            text = q.get("question") or q.get("text") or ""
            if not text:
                continue
            rows.append(QuestionItem(
                feature=feature,
                question=text,
                options=q.get("options"),
                correct_option=q.get("correct_option"),
                answer=q.get("answer"),
                explanation=q.get("explanation"),
                board=paper.board,
                class_num=paper.class_num,
                subject=paper.subject,
                chapter=paper.chapter,
                paper_id=paper.id,
            ))
    if not rows:
        return
    await ai_crud.replace_paper_questions(db, paper.id, rows)


# ── Generated Papers ──────────────────────────────────────────────────────────

@router.post("/papers/generate", status_code=202, dependencies=[Depends(require_admin)], summary="[Admin] Queue LLM (Ollama) paper/quiz generation — runs in a Celery background task")
async def generate_paper(body: PaperGenerateRequest, db: AsyncSession = Depends(get_db)):
    """
    Non-blocking: create a GeneratedPaper row (status=GENERATING) and enqueue a
    Celery task that builds RAG context → calls Ollama → auto-verifies → fills in
    the questions (status PUBLISHED) or marks it FAILED. Returns immediately; the
    admin polls GET /papers/{id} or sees it in the Generated Papers list.
    """
    title = body.title or f"{body.count} Questions – {body.chapter or body.topic or body.subject or 'Paper'}"
    paper = await ai_crud.create_paper(db, {
        "paper_type": body.paper_type,
        "board": (body.board or "").lower() or None,
        "class_num": body.class_num,
        "subject": (body.subject or "").lower() or None,
        "chapter": body.chapter, "topic": body.topic,
        "title": title,
        "difficulty": body.difficulty,
        "content": {"status": "generating"},
        "generated_by": "ollama",
        "verified": False,
        "status": "GENERATING",
    })

    generate_paper_task.delay(str(paper.id), {
        "paper_type": body.paper_type, "board": body.board, "class_num": body.class_num,
        "subject": body.subject, "chapter": body.chapter, "topic": body.topic,
        "difficulty": body.difficulty, "count": body.count,
    })
    return {"id": str(paper.id), "title": paper.title, "status": "GENERATING",
            "message": "Generation queued — it will appear in Generated Papers shortly."}


ALLOWED_QUESTION_FEATURES = {"questions", "quiz", "custom"}


@router.get("/questions", summary="Student question bank — feature-isolated random questions (Redis-first, 3/day per feature)")
async def get_questions(
    board:     str | None = Query(default=None, max_length=50),
    class_num: int | None = Query(default=None, ge=1, le=12),
    subject:   str | None = Query(default=None, max_length=100),
    chapter:   str | None = Query(default=None, max_length=200),
    count:     int        = Query(default=10, ge=1, le=30),
    feature:   str        = Query(default="questions"),  # "questions" | "quiz" | "custom"
    user_id:   uuid.UUID = Depends(get_current_user_id),
    db:        AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    # Guard against unknown feature values
    safe_feature = feature if feature in ALLOWED_QUESTION_FEATURES else "questions"

    # Per-feature daily limit — quiz / custom / questions each have their own counter
    remaining = None
    if user_id and subject:
        remaining = await usage_tracker.check_and_log(
            db, str(user_id), safe_feature,
            params={"board": board, "class_num": class_num, "subject": subject, "chapter": chapter, "count": count},
        )

    b = (board or "").lower() or None
    s = (subject or "").lower() or None

    # 1. Redis fast path (feature-isolated key)
    qs = await question_cache.fetch_random(redis, safe_feature, b, class_num, s, chapter, count)
    if qs:
        return {"questions": qs, "count": len(qs), "source": "cache", "remaining_uses": remaining}

    # 2. DB: query question_items filtered by feature — each type stays completely separate
    rows = await ai_crud.get_random_questions(db, safe_feature, b, class_num, s, chapter)

    if not rows:
        return {"questions": [], "count": 0, "source": "empty", "remaining_uses": remaining}

    pool = [
        {
            "question": r.question,
            "options": r.options or [],
            "correct_option": r.correct_option,
            "answer": r.answer,
            "explanation": r.explanation,
            "chapter": r.chapter,
        }
        for r in rows
    ]

    # Warm Redis for next request, then return a random sample
    await question_cache.cache_questions(redis, safe_feature, b, class_num, s, chapter, pool)
    random.shuffle(pool)
    return {"questions": pool[:count], "count": min(count, len(pool)), "source": "db", "remaining_uses": remaining}


async def get_optional_role(
    creds=Depends(bearer),
) -> str | None:
    """Return the caller's role without requiring auth — used to differentiate
    admin vs user. Verifies the token by calling auth_service via
    dependencies.py's `verify_token` (the same single JWT-verification code
    path used everywhere else in this service) instead of decoding locally."""
    if not creds:
        return None
    try:
        data = await verify_token(creds.credentials)
        return data.get("role")
    except HTTPException:
        return None


@router.get("/papers/{paper_id}", summary="Get a single generated paper (poll generation status)")
async def get_paper(
    paper_id: uuid.UUID,
    _uid:     uuid.UUID = Depends(get_current_user_id),  # require login — paper content holds answer keys
    role:     str | None = Depends(get_optional_role),
    db:       AsyncSession = Depends(get_db),
):
    p = await ai_crud.get_paper_by_id(db, paper_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paper not found")
    is_admin = role in ("admin", "super_admin")
    if not is_admin and p.status != "PUBLISHED":
        # Don't leak existence/state of DRAFT/GENERATING/unverified papers to
        # non-admins — behave the same as "not found" (matches list endpoint's
        # PUBLISHED-only restriction at GET /ai/papers).
        raise HTTPException(status_code=404, detail="Paper not found")
    return {
        "id": str(p.id), "title": p.title, "paper_type": p.paper_type, "status": p.status,
        "verified": p.verified, "generated_by": p.generated_by, "difficulty": p.difficulty,
        "total_marks": p.total_marks, "duration_min": p.duration_min,
        "board": p.board, "class_num": p.class_num, "subject": p.subject, "chapter": p.chapter,
        "content": p.content,
    }


@router.delete("/papers/{paper_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_paper(paper_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    p = await ai_crud.get_paper_by_id(db, paper_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paper not found")
    await ai_crud.delete_paper(db, paper_id)


@router.post("/papers", response_model=PaperResponse, status_code=201, dependencies=[Depends(require_admin)])
async def create_paper(
    body:  PaperCreate,
    db:    AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Create a single generated paper (from local worker or admin). Auto-warms Redis if PUBLISHED."""
    # source_job_id (and the rest of the dict) is already the right Python
    # type here — PaperCreate validates it as uuid.UUID, so no manual
    # str→UUID conversion is needed (and re-wrapping an already-UUID value in
    # uuid.UUID(...) would raise TypeError).
    data = body.model_dump()
    if data.get("subject"):
        data["subject"] = data["subject"].lower()
    if data.get("board"):
        data["board"] = data["board"].lower()
    paper = await ai_crud.create_paper(db, data)
    if paper.status == "PUBLISHED" and paper.verified:
        await extract_and_save_questions(db, paper)
        await db.commit()
        await paper_cache.invalidate_papers(redis, paper.board, paper.class_num, paper.subject)
    return paper


@router.post("/papers/bulk", status_code=201, dependencies=[Depends(require_admin)])
async def bulk_create_papers(
    body:  PaperBulkCreate,
    db:    AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Local worker dumps all generated papers in one call. Extracts questions and invalidates Redis."""
    papers_data = []
    for p in body.papers:
        d = p.model_dump()
        if d.get("subject"):
            d["subject"] = d["subject"].lower()
        if d.get("board"):
            d["board"] = d["board"].lower()
        papers_data.append(d)
    papers = await ai_crud.bulk_create_papers(db, papers_data)
    seen = set()
    for p in papers:
        if p.status == "PUBLISHED" and p.verified:
            await extract_and_save_questions(db, p)
            key = (p.board, p.class_num, p.subject)
            if key not in seen:
                seen.add(key)
    await db.commit()
    for board, class_num, subject in seen:
        await paper_cache.invalidate_papers(redis, board, class_num, subject)
    return {"created": len(papers), "paper_ids": [str(p.id) for p in papers]}


QUIZ_CUSTOM_TYPES = {"quiz_paper", "custom"}
PAPER_TYPE_TO_FEATURE = {
    "quiz_paper":      "quiz",
    "practice_paper":  "paper",
    "mock_test":       "paper",
    "revision_paper":  "paper",
    "custom":          "custom",
}


@router.get("/papers", summary="List generated papers — PUBLISHED only for students, all statuses for admins (Redis-first, 3/day per user)")
async def get_papers(
    paper_type: Literal["quiz_paper", "revision_paper", "practice_paper", "mock_test", "custom"] | None = Query(default=None),
    board:      str | None = Query(default=None, max_length=50),
    class_num:  int | None = Query(default=None, ge=1, le=12),
    subject:    str | None = Query(default=None, max_length=100),
    chapter:    str | None = Query(default=None, max_length=200),
    page:       int        = Query(default=1, ge=1),
    limit:      int        = Query(default=20, ge=1, le=100),
    role:       str | None = Depends(get_optional_role),
    user_id:    uuid.UUID = Depends(get_current_user_id),
    db:         AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    is_admin = role in ("admin", "super_admin")

    if is_admin:
        offset = (page - 1) * limit
        papers = await ai_crud.get_papers(db, paper_type, board, class_num, subject, chapter, limit, offset)
        total  = await ai_crud.count_papers(db, paper_type, board, class_num, subject, chapter)
        return {"papers": [PaperResponse.model_validate(p) for p in papers], "total": total, "page": page, "source": "db"}

    # ── Student path ──────────────────────────────────────────────────────────
    # Daily limit: only enforce when a user is authenticated and filtering by subject
    # (the background count query has no subject → not counted)
    remaining = None
    feature = PAPER_TYPE_TO_FEATURE.get(paper_type or "", None)
    if user_id and subject and feature:
        remaining = await usage_tracker.check_and_log(
            db, str(user_id), feature,
            params={"paper_type": paper_type, "board": board, "class_num": class_num,
                    "subject": subject, "chapter": chapter},
        )

    # Cap limit to 30 for quiz and custom types
    if paper_type in QUIZ_CUSTOM_TYPES:
        limit = min(limit, 30)

    use_cache = (page == 1 and paper_type is not None and not chapter)
    if use_cache:
        cached = await paper_cache.fetch_papers(redis, board, class_num, subject, paper_type)
        if cached is not None:
            return {"papers": cached[:limit], "total": len(cached), "page": 1,
                    "source": "cache", "remaining_uses": remaining}

    offset = (page - 1) * limit
    papers = await ai_crud.get_papers(
        db, paper_type, board, class_num, subject, chapter, limit, offset, published_only=True
    )
    total = await ai_crud.count_papers(
        db, paper_type, board, class_num, subject, chapter, published_only=True
    )
    serialized = [PaperResponse.model_validate(p).model_dump(mode="json") for p in papers]

    if use_cache and serialized:
        await paper_cache.cache_papers(redis, board, class_num, subject, paper_type, serialized)

    return {"papers": serialized, "total": total, "page": page, "source": "db", "remaining_uses": remaining}
