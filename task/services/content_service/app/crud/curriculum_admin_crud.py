import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    Chapter,
    ContentBoard,
    ContentClass,
    DifficultyLevel,
    Subject,
    Topic,
)
from app.schemas.content import (
    BoardUpdate,
    ChapterUpdate,
    ClassUpdate,
    SubjectUpdate,
    TopicUpdate,
)


async def admin_get_boards(db: AsyncSession, include_inactive: bool) -> list[ContentBoard]:
    stmt = select(ContentBoard)
    if not include_inactive:
        stmt = stmt.where(ContentBoard.is_active == True)  # noqa: E712
    stmt = stmt.order_by(ContentBoard.name)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_board(db: AsyncSession, board_id: uuid.UUID) -> ContentBoard | None:
    return await db.get(ContentBoard, board_id)


async def update_board(db: AsyncSession, board: ContentBoard, body: BoardUpdate) -> ContentBoard:
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(board, k, v)
    await db.commit()
    await db.refresh(board)
    return board


async def deactivate_board(db: AsyncSession, board: ContentBoard) -> None:
    board.is_active = False
    await db.commit()


# ── Admin Catalog: Classes ────────────────────────────────────────────────────


async def admin_get_classes(
    db: AsyncSession, board_id: uuid.UUID | None, include_inactive: bool
) -> list[ContentClass]:
    stmt = select(ContentClass)
    if board_id:
        stmt = stmt.where(ContentClass.board_id == board_id)
    if not include_inactive:
        stmt = stmt.where(ContentClass.is_active == True)  # noqa: E712
    stmt = stmt.order_by(ContentClass.number)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_class(db: AsyncSession, class_id: uuid.UUID) -> ContentClass | None:
    return await db.get(ContentClass, class_id)


async def update_class(db: AsyncSession, cls: ContentClass, body: ClassUpdate) -> ContentClass:
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(cls, k, v)
    await db.commit()
    await db.refresh(cls)
    return cls


async def deactivate_class(db: AsyncSession, cls: ContentClass) -> None:
    cls.is_active = False
    await db.commit()


# ── Admin Catalog: Subjects ───────────────────────────────────────────────────


async def admin_get_subjects(
    db: AsyncSession, class_id: uuid.UUID | None, include_inactive: bool
) -> list[Subject]:
    stmt = select(Subject)
    if class_id:
        stmt = stmt.where(Subject.class_id == class_id)
    if not include_inactive:
        stmt = stmt.where(Subject.is_active == True)  # noqa: E712
    stmt = stmt.order_by(Subject.name)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_subject(db: AsyncSession, subject_id: uuid.UUID) -> Subject | None:
    return await db.get(Subject, subject_id)


async def update_subject(db: AsyncSession, subject: Subject, body: SubjectUpdate) -> Subject:
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(subject, k, v)
    await db.commit()
    await db.refresh(subject)
    return subject


async def deactivate_subject(db: AsyncSession, subject: Subject) -> None:
    subject.is_active = False
    await db.commit()


# ── Admin Catalog: Chapters ───────────────────────────────────────────────────


async def admin_get_chapters(
    db: AsyncSession,
    subject_id: uuid.UUID | None,
    include_inactive: bool,
    limit: int,
    offset: int,
) -> list[Chapter]:
    stmt = select(Chapter)
    if subject_id:
        stmt = stmt.where(Chapter.subject_id == subject_id)
    if not include_inactive:
        stmt = stmt.where(Chapter.is_active == True)  # noqa: E712
    stmt = stmt.order_by(Chapter.sequence).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_chapter(db: AsyncSession, chapter_id: uuid.UUID) -> Chapter | None:
    return await db.get(Chapter, chapter_id)


async def update_chapter(db: AsyncSession, chapter: Chapter, body: ChapterUpdate) -> Chapter:
    if body.title is not None:
        chapter.title = body.title
    if body.description is not None:
        chapter.description = body.description
    if body.sequence is not None:
        chapter.sequence = body.sequence
    await db.commit()
    await db.refresh(chapter)
    return chapter


async def deactivate_chapter(db: AsyncSession, chapter: Chapter) -> None:
    chapter.is_active = False
    await db.commit()


# ── Admin Catalog: Topics ─────────────────────────────────────────────────────


async def admin_get_topics(
    db: AsyncSession,
    chapter_id: uuid.UUID | None,
    include_inactive: bool,
    limit: int,
    offset: int,
) -> list[Topic]:
    stmt = select(Topic)
    if chapter_id:
        stmt = stmt.where(Topic.chapter_id == chapter_id)
    if not include_inactive:
        stmt = stmt.where(Topic.is_active == True)  # noqa: E712
    stmt = stmt.order_by(Topic.sequence).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_topic(db: AsyncSession, topic_id: uuid.UUID) -> Topic | None:
    return await db.get(Topic, topic_id)


async def update_topic(db: AsyncSession, topic: Topic, body: TopicUpdate) -> Topic:
    # body.difficulty is a validated DifficultyLevel enum (422 automatically on an
    # invalid value — Pydantic rejects it before this code ever runs).
    if body.title is not None:
        topic.title = body.title
    if body.description is not None:
        topic.description = body.description
    if body.sequence is not None:
        topic.sequence = body.sequence
    if body.difficulty is not None:
        topic.difficulty = body.difficulty
    if body.is_active is not None:
        topic.is_active = body.is_active
    await db.commit()
    await db.refresh(topic)
    return topic


async def deactivate_topic(db: AsyncSession, topic: Topic) -> None:
    topic.is_active = False
    await db.commit()


# ── PYP Practice Questions ────────────────────────────────────────────────────
