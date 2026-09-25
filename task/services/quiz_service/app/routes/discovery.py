import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import TTL_QUESTIONS, cache_get, cache_set, questions_key, zrevrange_with_scores
from app.core.cache import POPULAR_QUESTIONS_KEY
from app.crud import quiz_definition_crud as quiz_crud
from app.database.session import get_db
from app.core.dependencies import get_current_user_id
from app.models.quiz import QuizType
from app.schemas.quiz_definition import QuizResponse

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


# ── General list & user attempts (must come before /{quiz_id}) ────────────────

@router.get("", response_model=list[QuizResponse], summary="List quizzes")
async def list_quizzes(
    quiz_type: QuizType | None = Query(default=None),
    board: str | None = Query(default=None),
    class_num: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    # board/class_num scope results to the caller's curriculum — same rule
    # applied to every other learning resource (subjects, chapters, videos, …).
    return await quiz_crud.list_all_quizzes(
        db, quiz_type=quiz_type, board=board, class_num=class_num, page=1, limit=limit
    )


@router.get("/random", response_model=QuizResponse, summary="Pick one quiz for the caller's board & class")
async def get_random_quiz(
    board: str | None = Query(default=None),
    class_num: int | None = Query(default=None),
    quiz_type: QuizType | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Powers 'Quick Quiz' / daily-goal shortcuts that don't already have a
    specific quiz_id in hand (e.g. dashboard quick actions) — resolves to a
    single real quiz scoped to the student's board & class instead of the
    client guessing or falling back to a placeholder id."""
    quiz = await quiz_crud.get_random_quiz(db, board=board, class_num=class_num, quiz_type=quiz_type)
    if quiz is None:
        raise HTTPException(status_code=404, detail="No quiz available for your board & class yet.")
    return quiz


@router.get("/chapter/{chapter_id}", response_model=list[QuizResponse])
async def list_chapter_quizzes(chapter_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await quiz_crud.get_chapter_quizzes(db, chapter_id)


@router.get("/board/{board}/{class_num}/{subject}/{chapter}")
async def get_questions_by_board(
    board: str, class_num: int, subject: str, chapter: str,
    db: AsyncSession = Depends(get_db),
):
    """Return cached questions. Key: questions:{board}:{class}:{subject}:{chapter}"""
    key    = questions_key(board, class_num, subject, chapter)
    cached = await cache_get(key)
    if cached:
        return {"source": "cache", "questions": cached}

    quiz = await quiz_crud.get_active_quiz_by_curriculum(db, board, class_num, subject, chapter)
    if not quiz:
        return {"source": "db", "questions": []}

    questions = await quiz_crud.get_quiz_questions(db, quiz.id)
    q_list = [
        {
            "id":       str(q.id),
            "question": q.text,
            "options":  q.options,
            "marks":    q.marks,
            "sequence": q.sequence,
            "topic":    str(q.topic_id) if q.topic_id else None,
        }
        for q in questions
    ]
    await cache_set(key, q_list, TTL_QUESTIONS)
    return {"source": "db", "questions": q_list}


@router.get("/popular-questions")
async def popular_questions(top: int = Query(default=20, ge=1, le=100)):
    """Top-N most-viewed questions from Redis sorted set."""
    raw = await zrevrange_with_scores(POPULAR_QUESTIONS_KEY, 0, top - 1)
    return {"questions": [{"question_id": qid, "views": int(count)} for qid, count in raw]}


@router.get("/pyps")
async def get_chapter_pyps(
    chapter_id: uuid.UUID = Query(..., description="Chapter UUID"),
    db: AsyncSession = Depends(get_db),
):
    """Return mock-test quizzes (PYPs) for a chapter."""
    quizzes = await quiz_crud.get_chapter_pyps(db, chapter_id)
    return [
        {
            "id": str(q.id),
            "title": q.title,
            "duration_minutes": q.duration_minutes,
            "total_marks": q.total_marks,
            "quiz_type": q.quiz_type,
        }
        for q in quizzes
    ]


@router.get("/chapter-score")
async def get_chapter_quiz_score(
    chapter_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    """Best completed quiz score for the caller across a chapter's quizzes."""
    row = await quiz_crud.get_best_chapter_quiz_score(db, chapter_id, caller_id)

    best = round(float(row.best_score or 0), 1) if row else 0.0
    count = int(row.attempts or 0) if row else 0
    return {
        "chapter_id": str(chapter_id),
        "best_score": best,
        "attempts": count,
        "completed": count > 0,
    }
