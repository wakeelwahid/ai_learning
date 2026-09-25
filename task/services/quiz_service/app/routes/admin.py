import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.crud import quiz_definition_crud as quiz_crud
from app.database.session import get_db
from app.models.quiz import QuizType
from app.schemas.quiz_definition import QuizAdminUpdate, QuizResponse
from app.workers.event_publisher import publish_event

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


# ── Static / prefix-specific routes (must come before /{quiz_id}) ─────────────

@router.get("/admin/list", response_model=list[QuizResponse], summary="[Admin] List all quizzes", dependencies=[Depends(require_admin)])
async def admin_list_quizzes(
    quiz_type: QuizType | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    return await quiz_crud.list_all_quizzes(db, quiz_type=quiz_type, page=page, limit=limit)


@router.get("/admin/stats", summary="[Admin] Quiz statistics", dependencies=[Depends(require_admin)])
async def admin_quiz_stats(db: AsyncSession = Depends(get_db)):
    chapter_count = await quiz_crud.count_quizzes(db, quiz_type="chapter")
    mock_count = await quiz_crud.count_quizzes(db, quiz_type="mock_test")
    total_questions = await quiz_crud.count_questions(db)
    total_quizzes = await quiz_crud.count_quizzes(db)
    return {
        "total_quizzes": total_quizzes,
        "chapter_quizzes": chapter_count,
        "mock_tests": mock_count,
        "total_questions": total_questions,
    }


@router.patch("/admin/{quiz_id}", response_model=QuizResponse, summary="[Admin] Update quiz metadata", dependencies=[Depends(require_admin)])
async def admin_update_quiz(quiz_id: uuid.UUID, body: QuizAdminUpdate, db: AsyncSession = Depends(get_db)):
    # body is a QuizAdminUpdate — an explicit allowlist of updatable quiz fields
    # (was previously `body: dict`, an unvalidated mass-assignment surface).
    quiz = await quiz_crud.patch_quiz(db, quiz_id, body.model_dump(exclude_unset=True))
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


@router.delete("/admin/{quiz_id}", summary="[Admin] Delete a quiz", dependencies=[Depends(require_admin)])
async def admin_delete_quiz(quiz_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    quiz = await quiz_crud.delete_quiz_cascade(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    await publish_event("quiz.cache_invalidate", {"quiz_id": str(quiz_id)})
    return {"deleted": True}
