import uuid

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import POPULAR_QUESTIONS_KEY, zincrby
from app.core.dependencies import get_current_user_id, require_teacher
from app.crud import quiz_definition_crud as quiz_crud
from app.database.session import get_db
from app.routes._common import trigger_cache_rebuild
from app.schemas.quiz_definition import QuestionCreate, QuestionResponse, QuizCreate, QuizResponse

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


# ── Content authoring: POST routes (no wildcard conflict) ─────────────────────

@router.post("", response_model=QuizResponse, status_code=201, dependencies=[Depends(require_teacher)])
async def create_quiz(
    body: QuizCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    quiz = await quiz_crud.create_quiz(db, body.model_dump())
    background_tasks.add_task(trigger_cache_rebuild, quiz.id)
    return quiz


@router.post("/questions", response_model=QuestionResponse, status_code=201, dependencies=[Depends(require_teacher)])
async def create_question(
    body: QuestionCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    question = await quiz_crud.create_question(db, body.model_dump())
    background_tasks.add_task(trigger_cache_rebuild, body.quiz_id)
    return question


@router.post("/questions/{question_id}/view", dependencies=[Depends(get_current_user_id)])
async def record_question_view(question_id: uuid.UUID):
    """Increment view count for a question in the popular_questions sorted set."""
    await zincrby(POPULAR_QUESTIONS_KEY, str(question_id), 1)
    return {"recorded": True}
