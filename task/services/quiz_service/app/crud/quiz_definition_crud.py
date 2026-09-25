import uuid

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.quiz import Question, Quiz, QuizAnswer, QuizAttempt


async def get_chapter_quizzes(db: AsyncSession, chapter_id: uuid.UUID) -> list[Quiz]:
    result = await db.execute(
        select(Quiz).where(Quiz.chapter_id == chapter_id, Quiz.is_active == True)  # noqa: E712
    )
    return result.scalars().all()


async def get_quiz_questions(db: AsyncSession, quiz_id: uuid.UUID) -> list[Question]:
    result = await db.execute(
        select(Question).where(Question.quiz_id == quiz_id).order_by(Question.sequence)
    )
    return result.scalars().all()


async def get_quiz(db: AsyncSession, quiz_id: uuid.UUID) -> Quiz | None:
    return await db.get(Quiz, quiz_id)


async def create_quiz(db: AsyncSession, data: dict) -> Quiz:
    quiz = Quiz(**data)
    db.add(quiz)
    await db.commit()
    await db.refresh(quiz)
    return quiz


async def create_question(db: AsyncSession, data: dict) -> Question:
    question = Question(**data)
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


async def bulk_create_questions(db: AsyncSession, quiz_id: uuid.UUID, questions_data: list[dict]) -> list[Question]:
    """Insert multiple questions in a single transaction."""
    created: list[Question] = []
    for data in questions_data:
        data["quiz_id"] = quiz_id
        q = Question(**data)
        db.add(q)
        created.append(q)
    await db.commit()
    for q in created:
        await db.refresh(q)
    return created


async def get_questions_by_ids(
    db: AsyncSession, question_ids: list[uuid.UUID]
) -> dict[uuid.UUID, Question]:
    """Return a mapping of question_id → Question for the given IDs."""
    result = await db.execute(
        select(Question).where(Question.id.in_(question_ids))
    )
    return {q.id: q for q in result.scalars().all()}


async def list_all_quizzes(
    db: AsyncSession,
    quiz_type: str | None = None,
    board: str | None = None,
    class_num: int | None = None,
    page: int = 1,
    limit: int = 50,
) -> list[Quiz]:
    """[Admin] List all quizzes with optional type/board/class filter and pagination."""
    stmt = select(Quiz).where(Quiz.is_active == True)  # noqa: E712
    if quiz_type:
        stmt = stmt.where(Quiz.quiz_type == quiz_type)
    # NULL board/class_num means "for everyone" on that axis, so those quizzes
    # must still match a caller's filter — plain equality would silently
    # exclude them since NULL never equals a non-NULL value.
    if board:
        stmt = stmt.where(or_(Quiz.board.is_(None), func.lower(Quiz.board) == board.lower()))
    if class_num:
        stmt = stmt.where(or_(Quiz.class_num.is_(None), Quiz.class_num == class_num))
    stmt = stmt.order_by(Quiz.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_random_quiz(
    db: AsyncSession,
    board: str | None = None,
    class_num: int | None = None,
    quiz_type: str | None = None,
) -> Quiz | None:
    """One active quiz matching board/class (falls back to any active quiz if
    the curriculum-scoped search comes up empty, so a thin catalog still gives
    the student something to play rather than a hard dead end)."""
    async def _pick(scoped: bool) -> Quiz | None:
        stmt = select(Quiz).where(Quiz.is_active == True)  # noqa: E712
        if quiz_type:
            stmt = stmt.where(Quiz.quiz_type == quiz_type)
        if scoped and board:
            stmt = stmt.where(or_(Quiz.board.is_(None), func.lower(Quiz.board) == board.lower()))
        if scoped and class_num:
            stmt = stmt.where(or_(Quiz.class_num.is_(None), Quiz.class_num == class_num))
        stmt = stmt.order_by(func.random()).limit(1)
        return (await db.execute(stmt)).scalar_one_or_none()

    quiz = await _pick(scoped=True)
    if quiz is None and (board or class_num):
        quiz = await _pick(scoped=False)
    return quiz


async def count_quizzes(db: AsyncSession, quiz_type: str | None = None) -> int:
    """[Admin] Count total quizzes, optionally filtered by type."""
    stmt = select(func.count(Quiz.id))
    if quiz_type:
        stmt = stmt.where(Quiz.quiz_type == quiz_type)
    return await db.scalar(stmt) or 0


async def count_questions(db: AsyncSession) -> int:
    """[Admin] Count total questions."""
    return await db.scalar(select(func.count(Question.id))) or 0


async def patch_quiz(db: AsyncSession, quiz_id: uuid.UUID, data: dict) -> Quiz | None:
    """[Admin] Update allowed quiz fields.

    `data` is expected to already be a validated, allowlisted dict (see
    app.schemas.quiz.QuizAdminUpdate) — this second allowlist is kept as
    defense-in-depth in case a future caller passes an unvalidated dict.
    `data` only contains keys the caller actually sent (the route builds it
    with `model_dump(exclude_unset=True)`), so `board`/`class_num` are
    allowed through even when explicitly null — that's how an admin clears
    one back to "for everyone" — while the rest keep the null-skips
    behaviour, since None isn't a meaningful value for them.
    """
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        return None
    allowed = {"title", "chapter_id", "quiz_type", "duration_minutes", "total_marks", "passing_marks", "is_premium", "is_active"}
    nullable_allowed = {"board", "class_num"}
    for key, val in data.items():
        if key in nullable_allowed:
            setattr(quiz, key, val)
        elif key in allowed and val is not None:
            setattr(quiz, key, val)
    await db.commit()
    await db.refresh(quiz)
    return quiz


async def delete_quiz(db: AsyncSession, quiz_id: uuid.UUID) -> bool:
    """[Admin] Delete a quiz and its questions."""
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        return False
    await db.delete(quiz)
    await db.commit()
    return True


async def delete_quiz_cascade(db: AsyncSession, quiz_id: uuid.UUID) -> Quiz | None:
    """[Admin] Delete a quiz and everything that references it.

    Cascade order (preserved exactly as it was in the route):
      1. Find all attempt IDs for the quiz.
      2. Delete all QuizAnswer records for those attempts.
      3. Delete all QuizAttempt records for the quiz.
      4. Delete all Question records for the quiz.
      5. Delete the quiz itself.
    All in one transaction — a single commit at the end.

    Returns the deleted Quiz (already-loaded, pre-delete) so the caller can
    build the response, or None if no quiz with this id exists.
    """
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        return None

    attempt_ids_result = await db.execute(
        select(QuizAttempt.id).where(QuizAttempt.quiz_id == quiz_id)
    )
    attempt_ids = [row[0] for row in attempt_ids_result.fetchall()]

    if attempt_ids:
        await db.execute(
            delete(QuizAnswer).where(QuizAnswer.attempt_id.in_(attempt_ids))
        )

    await db.execute(
        delete(QuizAttempt).where(QuizAttempt.quiz_id == quiz_id)
    )

    await db.execute(
        delete(Question).where(Question.quiz_id == quiz_id)
    )

    await db.delete(quiz)
    await db.commit()
    return quiz


async def get_active_quiz_by_curriculum(
    db: AsyncSession, board: str, class_num: int, subject: str, chapter: str,
) -> Quiz | None:
    """Single active quiz matching board/class/subject/chapter (cache-miss
    path). A quiz with NULL board/class_num is "for everyone" on that axis,
    so it still matches a caller's specific curriculum."""
    result = await db.execute(
        select(Quiz).where(
            or_(Quiz.board.is_(None), Quiz.board == board),
            or_(Quiz.class_num.is_(None), Quiz.class_num == class_num),
            Quiz.subject_name == subject,
            Quiz.chapter_name == chapter,
            Quiz.is_active    == True,  # noqa: E712
        ).limit(1)
    )
    return result.scalar_one_or_none()


async def get_chapter_pyps(db: AsyncSession, chapter_id: uuid.UUID) -> list[Quiz]:
    """Active mock-test quizzes (PYPs) for a chapter, newest first."""
    result = await db.execute(
        select(Quiz).where(
            Quiz.chapter_id == chapter_id,
            Quiz.quiz_type == "mock_test",
            Quiz.is_active == True,  # noqa: E712
        ).order_by(Quiz.created_at.desc())
    )
    return result.scalars().all()


async def get_best_chapter_quiz_score(
    db: AsyncSession, chapter_id: uuid.UUID, user_id: uuid.UUID,
):
    """Best completed-quiz percentage and attempt count for a user across a chapter's quizzes."""
    return (await db.execute(
        select(
            func.max(QuizAttempt.percentage).label("best_score"),
            func.count(QuizAttempt.id).label("attempts"),
        )
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .where(
            Quiz.chapter_id == chapter_id,
            QuizAttempt.user_id == user_id,
            QuizAttempt.status == "completed",
        )
    )).one_or_none()


async def update_quiz_total_marks(db: AsyncSession, quiz_id: uuid.UUID, total_marks: int) -> None:
    """[Admin] Recompute a quiz's total_marks after bulk-creating questions."""
    await db.execute(update(Quiz).where(Quiz.id == quiz_id).values(total_marks=total_marks))
    await db.commit()
