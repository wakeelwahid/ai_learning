import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.parent_features import MeetingRequest, ParentApprovalRequest, ParentLinkDecline
from app.models.user_profile import ParentProfile


# ── Purchase approvals ────────────────────────────────────────────────────────

async def list_approval_parents(db: AsyncSession, student_user_id: uuid.UUID) -> list[uuid.UUID]:
    """Parents whose APPROVED link to this student has Approval Mode on."""
    result = await db.execute(
        select(ParentProfile.parent_user_id).where(
            ParentProfile.student_user_id == student_user_id,
            ParentProfile.is_approved.is_(True),
            ParentProfile.approval_required.is_(True),
        )
    )
    return list(result.scalars().all())


async def get_pending_approval(
    db: AsyncSession, student_user_id: uuid.UUID, kind: str, reference: str
) -> ParentApprovalRequest | None:
    result = await db.execute(
        select(ParentApprovalRequest).where(
            ParentApprovalRequest.student_user_id == student_user_id,
            ParentApprovalRequest.kind == kind,
            ParentApprovalRequest.reference == reference,
            ParentApprovalRequest.status == "pending",
        ).limit(1)
    )
    return result.scalar_one_or_none()


async def create_approval_requests(
    db: AsyncSession,
    student_user_id: uuid.UUID,
    parent_ids: list[uuid.UUID],
    kind: str,
    reference: str,
    title: str,
    amount: float | None,
) -> list[ParentApprovalRequest]:
    rows = [
        ParentApprovalRequest(
            student_user_id=student_user_id,
            parent_user_id=pid,
            kind=kind,
            reference=reference,
            title=title,
            amount=amount,
            status="pending",
        )
        for pid in parent_ids
    ]
    db.add_all(rows)
    await db.commit()
    for row in rows:
        await db.refresh(row)
    return rows


async def list_student_approvals(db: AsyncSession, student_user_id: uuid.UUID) -> list[ParentApprovalRequest]:
    result = await db.execute(
        select(ParentApprovalRequest)
        .where(ParentApprovalRequest.student_user_id == student_user_id)
        .order_by(ParentApprovalRequest.created_at.desc())
    )
    return list(result.scalars().all())


async def list_parent_pending_approvals(db: AsyncSession, parent_user_id: uuid.UUID) -> list[ParentApprovalRequest]:
    result = await db.execute(
        select(ParentApprovalRequest)
        .where(
            ParentApprovalRequest.parent_user_id == parent_user_id,
            ParentApprovalRequest.status == "pending",
        )
        .order_by(ParentApprovalRequest.created_at.desc())
    )
    return list(result.scalars().all())


async def count_parent_pending_approvals(db: AsyncSession, parent_user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(ParentApprovalRequest).where(
            ParentApprovalRequest.parent_user_id == parent_user_id,
            ParentApprovalRequest.status == "pending",
        )
    )
    return int(result.scalar_one())


async def get_approval_by_id(db: AsyncSession, approval_id: uuid.UUID) -> ParentApprovalRequest | None:
    result = await db.execute(select(ParentApprovalRequest).where(ParentApprovalRequest.id == approval_id))
    return result.scalar_one_or_none()


async def decide_approval(
    db: AsyncSession, row: ParentApprovalRequest, status: str, note: str | None
) -> ParentApprovalRequest:
    row.status = status
    row.note = note
    row.decided_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return row


async def has_approved_purchase(db: AsyncSession, student_user_id: uuid.UUID, reference: str) -> bool:
    result = await db.execute(
        select(ParentApprovalRequest.id).where(
            ParentApprovalRequest.student_user_id == student_user_id,
            ParentApprovalRequest.kind == "purchase",
            ParentApprovalRequest.reference == reference,
            ParentApprovalRequest.status == "approved",
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def consume_approved_purchase(db: AsyncSession, student_user_id: uuid.UUID, reference: str) -> int:
    result = await db.execute(
        update(ParentApprovalRequest)
        .where(
            ParentApprovalRequest.student_user_id == student_user_id,
            ParentApprovalRequest.kind == "purchase",
            ParentApprovalRequest.reference == reference,
            ParentApprovalRequest.status == "approved",
        )
        .values(status="consumed")
    )
    await db.commit()
    return int(result.rowcount or 0)


# ── Decline cooldown ──────────────────────────────────────────────────────────

async def get_link_decline(
    db: AsyncSession, parent_user_id: uuid.UUID, student_user_id: uuid.UUID
) -> ParentLinkDecline | None:
    result = await db.execute(
        select(ParentLinkDecline).where(
            ParentLinkDecline.parent_user_id == parent_user_id,
            ParentLinkDecline.student_user_id == student_user_id,
        )
    )
    return result.scalar_one_or_none()


async def record_link_decline(
    db: AsyncSession, parent_user_id: uuid.UUID, student_user_id: uuid.UUID
) -> ParentLinkDecline:
    row = await get_link_decline(db, parent_user_id, student_user_id)
    now = datetime.now(timezone.utc)
    if row is None:
        row = ParentLinkDecline(
            parent_user_id=parent_user_id,
            student_user_id=student_user_id,
            declined_at=now,
            count=1,
        )
        db.add(row)
    else:
        row.count += 1
        row.declined_at = now
    await db.commit()
    await db.refresh(row)
    return row


async def clear_link_decline(db: AsyncSession, parent_user_id: uuid.UUID, student_user_id: uuid.UUID) -> None:
    await db.execute(
        delete(ParentLinkDecline).where(
            ParentLinkDecline.parent_user_id == parent_user_id,
            ParentLinkDecline.student_user_id == student_user_id,
        )
    )
    await db.commit()


# ── Badges ────────────────────────────────────────────────────────────────────

async def count_pending_links(db: AsyncSession, *, student_user_id: uuid.UUID | None = None,
                              parent_user_id: uuid.UUID | None = None) -> int:
    stmt = select(func.count()).select_from(ParentProfile).where(ParentProfile.is_approved.is_(False))
    if student_user_id is not None:
        stmt = stmt.where(ParentProfile.student_user_id == student_user_id)
    if parent_user_id is not None:
        stmt = stmt.where(ParentProfile.parent_user_id == parent_user_id)
    result = await db.execute(stmt)
    return int(result.scalar_one())


# ── Meetings ──────────────────────────────────────────────────────────────────

async def count_pending_meetings(db: AsyncSession, parent_user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(MeetingRequest).where(
            MeetingRequest.parent_user_id == parent_user_id,
            MeetingRequest.status == "pending",
        )
    )
    return int(result.scalar_one())


async def create_meeting(
    db: AsyncSession,
    parent_user_id: uuid.UUID,
    student_user_id: uuid.UUID,
    preferred_at: datetime,
    topic: str,
    notes: str | None,
) -> MeetingRequest:
    row = MeetingRequest(
        parent_user_id=parent_user_id,
        student_user_id=student_user_id,
        preferred_at=preferred_at,
        topic=topic,
        notes=notes,
        status="pending",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_meeting_by_id(db: AsyncSession, meeting_id: uuid.UUID) -> MeetingRequest | None:
    result = await db.execute(select(MeetingRequest).where(MeetingRequest.id == meeting_id))
    return result.scalar_one_or_none()


async def list_parent_meetings(db: AsyncSession, parent_user_id: uuid.UUID) -> list[MeetingRequest]:
    result = await db.execute(
        select(MeetingRequest)
        .where(MeetingRequest.parent_user_id == parent_user_id)
        .order_by(MeetingRequest.created_at.desc())
    )
    return list(result.scalars().all())


async def list_meetings(
    db: AsyncSession, status: str | None, limit: int, offset: int
) -> list[MeetingRequest]:
    stmt = select(MeetingRequest).order_by(MeetingRequest.created_at.desc())
    if status:
        stmt = stmt.where(MeetingRequest.status == status)
    result = await db.execute(stmt.offset(offset).limit(limit))
    return list(result.scalars().all())


async def save_meeting(db: AsyncSession, row: MeetingRequest) -> MeetingRequest:
    await db.commit()
    await db.refresh(row)
    return row
