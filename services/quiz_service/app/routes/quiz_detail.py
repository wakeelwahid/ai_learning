import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, quiz_id_key
from app.core.dependencies import require_teacher
from app.crud import quiz_definition_crud as quiz_crud
from app.database.session import get_db
from app.routes._common import trigger_cache_rebuild
from app.schemas.quiz_definition import BulkQuestionCreate, QuestionResponse, QuizResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/quizzes", tags=["quizzes"])


# ── Wildcard /{quiz_id} routes — MUST be last ─────────────────────────────────

@router.get("/{quiz_id}/questions")
async def get_quiz_questions(quiz_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return questions — serve from Redis quiz cache when available."""
    try:
        cached = await cache_get(quiz_id_key(str(quiz_id)))
        if cached:
            qs = [
                {k: v for k, v in q.items() if k != "correct_answer"}
                for q in cached.get("questions", [])
            ]
            return qs
    except Exception:
        pass
    try:
        questions = await quiz_crud.get_quiz_questions(db, quiz_id)
        return [QuestionResponse.model_validate(q).model_dump() for q in questions]
    except Exception as e:
        logger.error("get_quiz_questions failed for %s: %s", quiz_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch questions")


@router.post("/{quiz_id}/questions/bulk", status_code=201, dependencies=[Depends(require_teacher)])
async def bulk_create_questions(
    quiz_id: uuid.UUID,
    body: BulkQuestionCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Admin: add multiple questions to a quiz and rebuild cache immediately."""
    questions_data = [
        {k: v for k, v in q.model_dump().items() if k != "quiz_id"}
        for q in body.questions
    ]
    questions = await quiz_crud.bulk_create_questions(db, quiz_id, questions_data)
    background_tasks.add_task(trigger_cache_rebuild, quiz_id)

    total = sum(q.marks for q in questions)
    await quiz_crud.update_quiz_total_marks(db, quiz_id, total)

    return {"quiz_id": str(quiz_id), "created": len(questions), "cache_rebuild": "queued"}


@router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz(quiz_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    quiz = await quiz_crud.get_quiz(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz
