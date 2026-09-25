import uuid

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    Chapter,
    DifficultyLevel,
    Exercise,
    PracticeQuestion,
    Question,
    Video,
)
from app.schemas.content import (
    ExerciseCreate,
    PracticeQuestionCreate,
    QuestionCreate,
    QuestionVideoCreate,
)


async def get_chapter_exercises(db: AsyncSession, chapter_id: uuid.UUID) -> list[Exercise]:
    result = await db.execute(
        select(Exercise)
        .where(Exercise.chapter_id == chapter_id, Exercise.is_active == True)  # noqa: E712
        .order_by(Exercise.sequence)
    )
    return result.scalars().all()


async def create_exercise(db: AsyncSession, data: ExerciseCreate) -> Exercise:
    e = Exercise(chapter_id=data.chapter_id, name=data.name, number=data.number, sequence=data.sequence)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return e


async def get_exercise(db: AsyncSession, exercise_id: uuid.UUID) -> Exercise | None:
    return (await db.execute(select(Exercise).where(Exercise.id == exercise_id))).scalar_one_or_none()


async def deactivate_exercise(db: AsyncSession, exercise: Exercise) -> None:
    exercise.is_active = False
    await db.commit()


# ── Question management ───────────────────────────────────────────────────────


async def get_exercise_questions(db: AsyncSession, exercise_id: uuid.UUID) -> list[Question]:
    result = await db.execute(
        select(Question)
        .where(Question.exercise_id == exercise_id, Question.is_active == True)  # noqa: E712
        .order_by(Question.sequence)
    )
    return result.scalars().all()


async def get_chapter_direct_questions(db: AsyncSession, chapter_id: uuid.UUID) -> list[Question]:
    result = await db.execute(
        select(Question)
        .where(Question.chapter_id == chapter_id, Question.exercise_id == None, Question.is_active == True)  # noqa: E711,E712
        .order_by(Question.sequence)
    )
    return result.scalars().all()


async def create_question(db: AsyncSession, data: QuestionCreate) -> Question:
    q = Question(
        chapter_id=data.chapter_id,
        exercise_id=data.exercise_id,
        question_number=data.question_number,
        question_text=data.question_text,
        sequence=data.sequence,
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return q


async def get_question(db: AsyncSession, question_id: uuid.UUID) -> Question | None:
    return (await db.execute(select(Question).where(Question.id == question_id))).scalar_one_or_none()


async def deactivate_question(db: AsyncSession, question: Question) -> None:
    question.is_active = False
    await db.commit()


# ── Question Video management ─────────────────────────────────────────────────


async def get_question_video(db: AsyncSession, question_id: uuid.UUID) -> Video | None:
    return (await db.execute(
        select(Video).where(Video.question_id == question_id, Video.is_active == True)  # noqa: E712
    )).scalar_one_or_none()


async def set_question_video(db: AsyncSession, question_id: uuid.UUID, data: QuestionVideoCreate) -> Video:
    for old in (await db.execute(
        select(Video).where(Video.question_id == question_id, Video.is_active == True)  # noqa: E712
    )).scalars().all():
        old.is_active = False
    v = Video(
        question_id=question_id,
        title=data.title,
        youtube_id=data.youtube_id,
        youtube_id_hi=data.youtube_id_hi,
        youtube_id_pa=data.youtube_id_pa,
        youtube_id_bho=data.youtube_id_bho,
        duration_seconds=data.duration_seconds,
        thumbnail_url=data.thumbnail_url,
        notes_url=data.notes_url,
        is_premium=data.is_premium,
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return v


async def delete_question_video(db: AsyncSession, question_id: uuid.UUID) -> None:
    for v in (await db.execute(
        select(Video).where(Video.question_id == question_id, Video.is_active == True)  # noqa: E712
    )).scalars().all():
        v.is_active = False
    await db.commit()


# ── Practice Question management ──────────────────────────────────────────────


async def get_question_practice_questions(db: AsyncSession, question_id: uuid.UUID) -> list[PracticeQuestion]:
    result = await db.execute(
        select(PracticeQuestion)
        .where(PracticeQuestion.question_id == question_id, PracticeQuestion.is_active == True)  # noqa: E712
        .order_by(PracticeQuestion.sequence)
    )
    return result.scalars().all()


async def get_exercise_practice_questions(db: AsyncSession, exercise_id: uuid.UUID) -> list[PracticeQuestion]:
    """Aggregate every practice question belonging to questions in this exercise."""
    result = await db.execute(
        select(PracticeQuestion)
        .join(Question, PracticeQuestion.question_id == Question.id)
        .where(Question.exercise_id == exercise_id, PracticeQuestion.is_active == True)  # noqa: E712
        .order_by(Question.sequence, PracticeQuestion.sequence)
    )
    return result.scalars().all()


async def get_chapter_practice_questions(db: AsyncSession, chapter_id: uuid.UUID) -> list[PracticeQuestion]:
    """Aggregate every practice question belonging to questions in this chapter."""
    result = await db.execute(
        select(PracticeQuestion)
        .join(Question, PracticeQuestion.question_id == Question.id)
        .where(Question.chapter_id == chapter_id, PracticeQuestion.is_active == True)  # noqa: E712
        .order_by(Question.sequence, PracticeQuestion.sequence)
    )
    return result.scalars().all()


async def get_subject_practice_questions(db: AsyncSession, subject_id: uuid.UUID) -> list[PracticeQuestion]:
    """Aggregate every practice question across all chapters in this subject — a full course paper."""
    result = await db.execute(
        select(PracticeQuestion)
        .join(Question, PracticeQuestion.question_id == Question.id)
        .join(Chapter, Question.chapter_id == Chapter.id)
        .where(Chapter.subject_id == subject_id, PracticeQuestion.is_active == True)  # noqa: E712
        .order_by(Chapter.sequence, Question.sequence, PracticeQuestion.sequence)
    )
    return result.scalars().all()


async def create_practice_question(db: AsyncSession, data: PracticeQuestionCreate) -> PracticeQuestion:
    # data.difficulty is now a validated DifficultyLevel enum (422 on bad input,
    # instead of the previous silent fallback to "medium" on an invalid string).
    pq = PracticeQuestion(
        question_id=data.question_id,
        text=data.text,
        option_a=data.option_a,
        option_b=data.option_b,
        option_c=data.option_c,
        option_d=data.option_d,
        correct_option=data.correct_option,
        explanation=data.explanation,
        difficulty=data.difficulty,
        sequence=data.sequence,
    )
    db.add(pq)
    await db.commit()
    await db.refresh(pq)
    return pq


async def get_practice_question(db: AsyncSession, pq_id: uuid.UUID) -> PracticeQuestion | None:
    return (await db.execute(select(PracticeQuestion).where(PracticeQuestion.id == pq_id))).scalar_one_or_none()


async def deactivate_practice_question(db: AsyncSession, pq: PracticeQuestion) -> None:
    pq.is_active = False
    await db.commit()


# ── seed-demo (comprehensive dev/demo catalog seed) ───────────────────────────
