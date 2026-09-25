import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin, require_teacher
from app.crud.exercises_crud import (
    create_exercise as _create_exercise,
    create_practice_question as _create_practice_question,
    create_question as _create_question,
    deactivate_exercise,
    deactivate_practice_question,
    deactivate_question,
    delete_question_video as _delete_question_video,
    get_chapter_direct_questions,
    get_chapter_exercises,
    get_chapter_practice_questions,
    get_exercise,
    get_exercise_practice_questions,
    get_exercise_questions,
    get_practice_question,
    get_question,
    get_question_practice_questions,
    get_question_video as _get_question_video,
    get_subject_practice_questions,
    set_question_video as _set_question_video,
)
from app.database.session import get_db
from app.schemas.content import (
    ExerciseCreate,
    PracticeQuestionCreate,
    QuestionCreate,
    QuestionVideoCreate,
)

router = APIRouter(prefix="/content", tags=["content"])


# ── Exercise management ───────────────────────────────────────────────────────
def ser_exercise(e) -> dict:
    return {"id": str(e.id), "chapter_id": str(e.chapter_id), "name": e.name, "number": e.number, "sequence": e.sequence}


@router.get("/chapters/{chapter_id}/exercises")
async def list_exercises(chapter_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await get_chapter_exercises(db, chapter_id)
    return [ser_exercise(e) for e in result]


@router.post("/exercises", status_code=201, dependencies=[Depends(require_teacher)])
async def create_exercise(body: ExerciseCreate, db: AsyncSession = Depends(get_db)):
    e = await _create_exercise(db, body)
    return ser_exercise(e)


@router.delete("/exercises/{exercise_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_exercise(exercise_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    e = await get_exercise(db, exercise_id)
    if not e:
        raise HTTPException(status_code=404, detail="Exercise not found")
    await deactivate_exercise(db, e)


# ── Question management ───────────────────────────────────────────────────────
def ser_question(q) -> dict:
    return {
        "id": str(q.id),
        "chapter_id": str(q.chapter_id),
        "exercise_id": str(q.exercise_id) if q.exercise_id else None,
        "question_number": q.question_number,
        "question_text": q.question_text,
        "sequence": q.sequence,
    }


@router.get("/exercises/{exercise_id}/questions")
async def list_exercise_questions(exercise_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await get_exercise_questions(db, exercise_id)
    return [ser_question(q) for q in result]


@router.get("/chapters/{chapter_id}/questions")
async def list_chapter_direct_questions(chapter_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await get_chapter_direct_questions(db, chapter_id)
    return [ser_question(q) for q in result]


@router.post("/questions", status_code=201, dependencies=[Depends(require_teacher)])
async def create_question(body: QuestionCreate, db: AsyncSession = Depends(get_db)):
    q = await _create_question(db, body)
    return ser_question(q)


@router.delete("/questions/{question_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_question(question_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    q = await get_question(db, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    await deactivate_question(db, q)


# ── Question Video management ─────────────────────────────────────────────────
def ser_video(v) -> dict:
    return {
        "id": str(v.id),
        "question_id": str(v.question_id) if v.question_id else None,
        "topic_id": str(v.topic_id) if v.topic_id else None,
        "title": v.title,
        "youtube_id": v.youtube_id,
        "youtube_id_hi": v.youtube_id_hi,
        "youtube_id_pa": v.youtube_id_pa,
        "youtube_id_bho": v.youtube_id_bho,
        "duration_seconds": v.duration_seconds,
        "thumbnail_url": v.thumbnail_url,
        "notes_url": getattr(v, "notes_url", None),
        "is_premium": v.is_premium,
        "is_active": v.is_active,
    }


@router.get("/questions/{question_id}/video")
async def get_question_video(question_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    v = await _get_question_video(db, question_id)
    return ser_video(v) if v else None


@router.post("/questions/{question_id}/video", status_code=201, dependencies=[Depends(require_teacher)])
async def set_question_video(question_id: uuid.UUID, body: QuestionVideoCreate, db: AsyncSession = Depends(get_db)):
    v = await _set_question_video(db, question_id, body)
    return ser_video(v)


@router.delete("/questions/{question_id}/video", status_code=204, dependencies=[Depends(require_admin)])
async def delete_question_video(question_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _delete_question_video(db, question_id)


# ── Practice Question management ──────────────────────────────────────────────
def ser_pq(pq) -> dict:
    return {
        "id": str(pq.id),
        "question_id": str(pq.question_id),
        "text": pq.text,
        "option_a": pq.option_a,
        "option_b": pq.option_b,
        "option_c": pq.option_c,
        "option_d": pq.option_d,
        "correct_option": pq.correct_option,
        "explanation": pq.explanation,
        "difficulty": pq.difficulty.value,
        "sequence": pq.sequence,
    }


@router.get("/questions/{question_id}/practice")
async def list_practice_questions(question_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await get_question_practice_questions(db, question_id)
    return [ser_pq(pq) for pq in result]


@router.get("/exercises/{exercise_id}/practice", summary="All practice questions across an exercise")
async def list_exercise_practice(exercise_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Aggregate every practice question belonging to questions in this exercise."""
    result = await get_exercise_practice_questions(db, exercise_id)
    return [ser_pq(pq) for pq in result]


@router.get("/chapters/{chapter_id}/practice", summary="All practice questions across a chapter")
async def list_chapter_practice(chapter_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Aggregate every practice question belonging to questions in this chapter."""
    result = await get_chapter_practice_questions(db, chapter_id)
    return [ser_pq(pq) for pq in result]


@router.get("/subjects/{subject_id}/practice", summary="All practice questions across a subject (course test)")
async def list_subject_practice(subject_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Aggregate every practice question across all chapters in this subject — a full course paper."""
    result = await get_subject_practice_questions(db, subject_id)
    return [ser_pq(pq) for pq in result]


@router.post("/practice-questions", status_code=201, dependencies=[Depends(require_teacher)])
async def create_practice_question(body: PracticeQuestionCreate, db: AsyncSession = Depends(get_db)):
    # body.difficulty is now a validated DifficultyLevel enum (422 on bad input,
    # instead of the previous silent fallback to "medium" on an invalid string).
    pq = await _create_practice_question(db, body)
    return ser_pq(pq)


@router.delete("/practice-questions/{pq_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_practice_question(pq_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    pq = await get_practice_question(db, pq_id)
    if not pq:
        raise HTTPException(status_code=404, detail="Practice question not found")
    await deactivate_practice_question(db, pq)
