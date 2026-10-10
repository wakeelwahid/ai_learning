import uuid

from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import (
    Chapter,
    ContentBoard,
    ContentClass,
    Note,
    Subject,
    Topic,
)
from app.schemas.content import (
    BoardCreate,
    ChapterCreate,
    ClassCreate,
    SubjectCreate,
    TopicCreate,
)


async def get_boards(db: AsyncSession) -> list[ContentBoard]:
    # Phase 3: selectinload fetches classes in a single batched query instead of N lazy loads
    result = await db.execute(
        select(ContentBoard)
        .where(ContentBoard.is_active == True)  # noqa: E712
        .options(selectinload(ContentBoard.classes))
    )
    return result.scalars().all()


async def get_classes(db: AsyncSession, board_id: uuid.UUID) -> list[ContentClass]:
    result = await db.execute(
        select(ContentClass)
        .where(ContentClass.board_id == board_id, ContentClass.is_active == True)  # noqa: E712
        .options(selectinload(ContentClass.subjects))
    )
    return result.scalars().all()


async def get_subjects(db: AsyncSession, class_id: uuid.UUID) -> list[Subject]:
    # Phase 3: eagerly load chapters so subject detail page doesn't lazy-load each one
    result = await db.execute(
        select(Subject)
        .where(Subject.class_id == class_id, Subject.is_active == True)  # noqa: E712
        .options(selectinload(Subject.chapters))
    )
    return result.scalars().all()


async def get_chapters(
    db: AsyncSession, subject_id: uuid.UUID, limit: int = 200, offset: int = 0
) -> list[Chapter]:
    # Phase 3: load topics + their videos in 3 total queries (chapters, topics, videos)
    # instead of 1 + N + N*M lazy queries.
    result = await db.execute(
        select(Chapter)
        .where(Chapter.subject_id == subject_id, Chapter.is_active == True)  # noqa: E712
        .order_by(Chapter.sequence)
        .offset(offset)
        .limit(limit)
        .options(
            selectinload(Chapter.topics).selectinload(Topic.videos),
            selectinload(Chapter.notes),
        )
    )
    return result.scalars().all()


async def get_topics(
    db: AsyncSession, chapter_id: uuid.UUID, limit: int = 200, offset: int = 0
) -> list[Topic]:
    # Phase 3: load videos in one batch query
    result = await db.execute(
        select(Topic)
        .where(Topic.chapter_id == chapter_id, Topic.is_active == True)  # noqa: E712
        .order_by(Topic.sequence)
        .offset(offset)
        .limit(limit)
        .options(selectinload(Topic.videos))
    )
    return result.scalars().all()


async def get_notes(
    db: AsyncSession,
    chapter_id: uuid.UUID,
    limit: int = 200,
    offset: int = 0,
    viewer_board: str | None = None,
    viewer_class: int | None = None,
) -> list[Note]:
    """See videos_crud.get_videos — same independent, optional
    target_board/target_class filter, NULL meaning "for everyone" on that
    axis."""
    stmt = select(Note).where(Note.chapter_id == chapter_id, Note.is_active == True)  # noqa: E712
    if viewer_board:
        stmt = stmt.where(or_(Note.target_board.is_(None), Note.target_board == viewer_board))
    if viewer_class:
        stmt = stmt.where(or_(Note.target_class.is_(None), Note.target_class == viewer_class))
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def create_board(db: AsyncSession, data: BoardCreate) -> ContentBoard:
    board = ContentBoard(name=data.name, code=data.code.upper())
    db.add(board)
    await db.commit()
    await db.refresh(board)
    return board


async def create_class(db: AsyncSession, data: ClassCreate) -> ContentClass:
    cls = ContentClass(board_id=data.board_id, name=data.name, number=data.number)
    db.add(cls)
    await db.commit()
    await db.refresh(cls)
    return cls


async def create_subject(db: AsyncSession, data: SubjectCreate) -> Subject:
    subject = Subject(
        class_id=data.class_id,
        name=data.name,
        code=data.code.upper(),
        icon_url=data.icon_url,
    )
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return subject


async def create_chapter(db: AsyncSession, data: ChapterCreate) -> Chapter:
    chapter = Chapter(**data.model_dump())
    db.add(chapter)
    await db.commit()
    await db.refresh(chapter)
    return chapter


async def create_topic(db: AsyncSession, data: TopicCreate) -> Topic:
    topic = Topic(**data.model_dump())
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return topic


async def get_subjects_for_board_class(db: AsyncSession, board: str, class_num: int) -> list:
    rows = (await db.execute(text("""
        SELECT s.id, s.name, s.code, s.icon_url,
               cl.id AS class_id, cl.number AS class_num, b.name AS board
        FROM subjects s
        JOIN classes cl ON cl.id = s.class_id
        JOIN boards  b  ON b.id = cl.board_id
        WHERE s.is_active
          AND cl.is_active
          AND b.is_active
          AND cl.number = :class_num
          AND (LOWER(b.name) = LOWER(:board) OR LOWER(b.code) = LOWER(:board))
        ORDER BY s.name
    """), {"class_num": class_num, "board": board})).mappings().all()
    return [dict(r) for r in rows]
