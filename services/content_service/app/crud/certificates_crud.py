import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    Chapter,
    CompletionCertificate,
    ContentBoard,
    ContentClass,
    Subject,
    UserLearningProgress,
)


async def get_certificate_by_user_entity(
    db: AsyncSession, user_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID
) -> CompletionCertificate | None:
    return (await db.execute(
        select(CompletionCertificate).where(
            CompletionCertificate.user_id == user_id,
            CompletionCertificate.entity_type == entity_type,
            CompletionCertificate.entity_id == entity_id,
        )
    )).scalar_one_or_none()


async def get_learning_progress(
    db: AsyncSession, user_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID
) -> UserLearningProgress | None:
    return (await db.execute(
        select(UserLearningProgress).where(
            UserLearningProgress.user_id == user_id,
            UserLearningProgress.entity_type == entity_type,
            UserLearningProgress.entity_id == entity_id,
        )
    )).scalar_one_or_none()


async def resolve_certificate_names(db: AsyncSession, entity_type: str, entity_id: uuid.UUID) -> dict:
    """Resolve chapter/subject/board/class names from the curriculum hierarchy for a certificate."""
    chapter_name = None
    subject_name = "Unknown Subject"
    board_name = "Unknown Board"
    class_num = 0

    if entity_type == "chapter":
        ch = (await db.execute(select(Chapter).where(Chapter.id == entity_id))).scalar_one_or_none()
        if ch:
            chapter_name = ch.title
            subj = (await db.execute(select(Subject).where(Subject.id == ch.subject_id))).scalar_one_or_none()
            if subj:
                subject_name = subj.name
                cls = (await db.execute(select(ContentClass).where(ContentClass.id == subj.class_id))).scalar_one_or_none()
                if cls:
                    class_num = cls.number
                    brd = (await db.execute(select(ContentBoard).where(ContentBoard.id == cls.board_id))).scalar_one_or_none()
                    if brd:
                        board_name = brd.name
    else:  # subject
        subj = (await db.execute(select(Subject).where(Subject.id == entity_id))).scalar_one_or_none()
        if subj:
            subject_name = subj.name
            cls = (await db.execute(select(ContentClass).where(ContentClass.id == subj.class_id))).scalar_one_or_none()
            if cls:
                class_num = cls.number
                brd = (await db.execute(select(ContentBoard).where(ContentBoard.id == cls.board_id))).scalar_one_or_none()
                if brd:
                    board_name = brd.name

    return {
        "chapter_name": chapter_name,
        "subject_name": subject_name,
        "board_name": board_name,
        "class_num": class_num,
    }


async def create_certificate(
    db: AsyncSession,
    certificate_number: str,
    user_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID,
    student_name: str,
    chapter_name: str | None,
    subject_name: str,
    board_name: str,
    class_num: int,
) -> CompletionCertificate:
    cert = CompletionCertificate(
        certificate_number=certificate_number,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        student_name=student_name,
        chapter_name=chapter_name,
        subject_name=subject_name,
        board=board_name,
        class_num=class_num,
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return cert


async def get_certificate_by_number(db: AsyncSession, certificate_number: str) -> CompletionCertificate | None:
    return (await db.execute(
        select(CompletionCertificate).where(CompletionCertificate.certificate_number == certificate_number)
    )).scalar_one_or_none()


async def list_certificates_for_user(
    db: AsyncSession, user_id: uuid.UUID, entity_type: str | None, limit: int
) -> list[CompletionCertificate]:
    stmt = (
        select(CompletionCertificate)
        .where(CompletionCertificate.user_id == user_id)
        .order_by(CompletionCertificate.issued_at.desc())
        .limit(limit)
    )
    if entity_type:
        stmt = stmt.where(CompletionCertificate.entity_type == entity_type)
    return (await db.execute(stmt)).scalars().all()


# ─── Previous Year Papers ──────────────────────────────────────────────────────
