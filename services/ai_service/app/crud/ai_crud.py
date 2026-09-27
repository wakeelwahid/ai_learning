"""Database CRUD — ai_content, ingestion_jobs, generated_papers, question_items."""
import uuid
from datetime import datetime

from sqlalchemy import delete as sa_delete, func, or_, select, update

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_content import AIContent
from app.models.ai_usage_log import AIUsageLog
from app.models.generated_paper import GeneratedPaper
from app.models.ingestion_job import IngestionJob
from app.models.paper_attempt import PaperAttempt
from app.models.question_item import QuestionItem


# ── AIContent ─────────────────────────────────────────────────────────────────

async def create_content(
    db: AsyncSession,
    chapter_id: str,
    content_type: str,
    title: str,
    content: str,
    difficulty: str | None = None,
) -> AIContent:
    record = AIContent(
        chapter_id=chapter_id, content_type=content_type,
        title=title, content=content, difficulty=difficulty,
        qdrant_indexed=False, chunks_indexed=0,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def get_content_by_chapter(
    db: AsyncSession, chapter_id: str, content_type: str,
) -> list[AIContent]:
    result = await db.execute(
        select(AIContent)
        .where(AIContent.chapter_id == chapter_id, AIContent.content_type == content_type)
        .order_by(AIContent.created_at.desc())
    )
    return result.scalars().all()


async def mark_indexed(db: AsyncSession, content_id: str, chunks_count: int) -> None:
    await db.execute(
        update(AIContent)
        .where(AIContent.id == content_id)
        .values(qdrant_indexed=True, chunks_indexed=chunks_count)
    )
    await db.commit()


# ── IngestionJob ──────────────────────────────────────────────────────────────

async def create_job(db: AsyncSession, data: dict) -> IngestionJob:
    job = IngestionJob(**data)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def get_pending_jobs(db: AsyncSession, limit: int = 10) -> list[IngestionJob]:
    result = await db.execute(
        select(IngestionJob)
        .where(IngestionJob.status == "PENDING")
        .order_by(IngestionJob.created_at.asc())
        .limit(limit)
    )
    return result.scalars().all()


async def get_job(db: AsyncSession, job_id: uuid.UUID) -> IngestionJob | None:
    return await db.get(IngestionJob, job_id)


async def start_job(db: AsyncSession, job_id: uuid.UUID, worker_id: str) -> None:
    await db.execute(
        update(IngestionJob)
        .where(IngestionJob.id == job_id)
        .values(status="PROCESSING", worker_id=worker_id, started_at=datetime.utcnow())
    )
    await db.commit()


async def complete_job(db: AsyncSession, job_id: uuid.UUID, chunks_indexed: int) -> None:
    await db.execute(
        update(IngestionJob)
        .where(IngestionJob.id == job_id)
        .values(
            status="COMPLETED",
            chunks_indexed=chunks_indexed,
            completed_at=datetime.utcnow(),
        )
    )
    await db.commit()


async def fail_job(db: AsyncSession, job_id: uuid.UUID, error: str) -> None:
    await db.execute(
        update(IngestionJob)
        .where(IngestionJob.id == job_id)
        .values(status="FAILED", error_message=error[:2000], completed_at=datetime.utcnow())
    )
    await db.commit()


async def list_jobs(
    db: AsyncSession,
    status: str | None = None,
    limit: int = 50,
) -> list[IngestionJob]:
    q = select(IngestionJob).order_by(IngestionJob.created_at.desc()).limit(limit)
    if status:
        q = q.where(IngestionJob.status == status.upper())
    result = await db.execute(q)
    return result.scalars().all()


# ── GeneratedPaper ────────────────────────────────────────────────────────────

async def create_paper(db: AsyncSession, data: dict) -> GeneratedPaper:
    paper = GeneratedPaper(**data)
    db.add(paper)
    await db.commit()
    await db.refresh(paper)
    return paper


async def bulk_create_papers(db: AsyncSession, papers_data: list[dict]) -> list[GeneratedPaper]:
    papers = [GeneratedPaper(**d) for d in papers_data]
    for p in papers:
        db.add(p)
    await db.commit()
    for p in papers:
        await db.refresh(p)
    return papers


def paper_filters(q, paper_type, board, class_num, subject, chapter, published_only=False):
    if published_only:
        q = q.where(GeneratedPaper.status == "PUBLISHED", GeneratedPaper.verified == True)
    if paper_type:
        q = q.where(GeneratedPaper.paper_type == paper_type)
    # A paper's own board/class_num being NULL means "for everyone" on that
    # axis, so it must still match a caller's filter — plain equality would
    # silently exclude those rows since NULL never equals a non-NULL value.
    if board:
        q = q.where(or_(GeneratedPaper.board.is_(None), GeneratedPaper.board == board.lower()))
    if class_num:
        q = q.where(or_(GeneratedPaper.class_num.is_(None), GeneratedPaper.class_num == class_num))
    if subject:
        q = q.where(GeneratedPaper.subject == subject.lower())
    if chapter:
        q = q.where(GeneratedPaper.chapter.ilike(f"%{chapter}%"))
    return q


async def get_papers(
    db: AsyncSession,
    paper_type: str | None = None,
    board: str | None = None,
    class_num: int | None = None,
    subject: str | None = None,
    chapter: str | None = None,
    limit: int = 20,
    offset: int = 0,
    published_only: bool = False,
) -> list[GeneratedPaper]:
    q = select(GeneratedPaper).order_by(GeneratedPaper.created_at.desc()).offset(offset).limit(limit)
    q = paper_filters(q, paper_type, board, class_num, subject, chapter, published_only=published_only)
    result = await db.execute(q)
    return result.scalars().all()


async def count_papers(
    db: AsyncSession,
    paper_type: str | None = None,
    board: str | None = None,
    class_num: int | None = None,
    subject: str | None = None,
    chapter: str | None = None,
    published_only: bool = False,
) -> int:
    q = select(func.count()).select_from(GeneratedPaper)
    q = paper_filters(q, paper_type, board, class_num, subject, chapter, published_only=published_only)
    result = await db.execute(q)
    return result.scalar() or 0


async def get_paper_by_id(db: AsyncSession, paper_id: uuid.UUID) -> GeneratedPaper | None:
    result = await db.execute(select(GeneratedPaper).where(GeneratedPaper.id == paper_id))
    return result.scalar_one_or_none()


async def delete_paper(db: AsyncSession, paper_id: uuid.UUID) -> None:
    await db.execute(sa_delete(GeneratedPaper).where(GeneratedPaper.id == paper_id))
    await db.commit()


# ── QuestionItem ──────────────────────────────────────────────────────────────

async def replace_paper_questions(db: AsyncSession, paper_id: uuid.UUID, rows: list[QuestionItem]) -> None:
    """Replace existing question_items for a paper (avoids duplicates on re-publish).
    Does not commit — callers extract-and-save as part of a larger paper-save transaction."""
    await db.execute(sa_delete(QuestionItem).where(QuestionItem.paper_id == paper_id))
    for row in rows:
        db.add(row)
    await db.flush()


async def get_random_questions(
    db: AsyncSession,
    feature: str,
    board: str | None,
    class_num: int | None,
    subject: str | None,
    chapter: str | None,
    limit: int = 500,
) -> list[QuestionItem]:
    stmt = select(QuestionItem).where(QuestionItem.feature == feature)
    # A row's own board/class_num being NULL means "for everyone" on that
    # axis, so it must match regardless of what the caller asked for —
    # QuestionItem.board == board alone would silently exclude those rows
    # since NULL never equals a non-NULL value in SQL.
    if board:
        stmt = stmt.where(or_(QuestionItem.board.is_(None), QuestionItem.board == board))
    if class_num:
        stmt = stmt.where(or_(QuestionItem.class_num.is_(None), QuestionItem.class_num == class_num))
    if subject:
        stmt = stmt.where(QuestionItem.subject == subject)
    if chapter:
        stmt = stmt.where(QuestionItem.chapter.ilike(f"%{chapter}%"))
    result = await db.execute(stmt.limit(limit))
    return result.scalars().all()


# ── PaperAttempt ──────────────────────────────────────────────────────────────

async def create_attempt(db: AsyncSession, attempt: PaperAttempt) -> PaperAttempt:
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return attempt


async def get_attempt_by_id(db: AsyncSession, attempt_id: uuid.UUID) -> PaperAttempt | None:
    result = await db.execute(select(PaperAttempt).where(PaperAttempt.id == attempt_id))
    return result.scalar_one_or_none()


async def get_user_attempts(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 50,
    since: datetime | None = None,
) -> list[PaperAttempt]:
    q = (
        select(PaperAttempt)
        .where(PaperAttempt.user_id == user_id)
        .order_by(PaperAttempt.created_at.desc())
        .limit(limit)
    )
    if since:
        q = q.where(PaperAttempt.created_at >= since)
    result = await db.execute(q)
    return result.scalars().all()


async def get_attempt_totals(
    db: AsyncSession, user_id: uuid.UUID, since: datetime,
) -> tuple[int, float | None, float | None]:
    """(attempts, avg_percentage, best_percentage) over completed attempts."""
    result = await db.execute(
        select(
            func.count(PaperAttempt.id),
            func.avg(PaperAttempt.percentage),
            func.max(PaperAttempt.percentage),
        ).where(
            PaperAttempt.user_id == user_id,
            PaperAttempt.status == "completed",
            PaperAttempt.created_at >= since,
        )
    )
    count, avg, best = result.one()
    return count or 0, avg, best


async def count_papers_generated(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Paper generations already recorded in ai_usage_log (feature='paper')."""
    result = await db.execute(
        select(func.count(AIUsageLog.id)).where(
            AIUsageLog.user_id == str(user_id), AIUsageLog.feature == "paper"
        )
    )
    return result.scalar() or 0
