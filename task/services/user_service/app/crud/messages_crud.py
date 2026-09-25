"""
CRUD helpers for parent-to-student direct messaging (HTTP polling).

Kept separate from user_crud.py because it operates on a distinct model
(Message) rather than UserProfile/ParentProfile/StudyTimeLimit — mirroring
notification_service's split between message_crud.py and notification_crud.py
for different models.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message
from app.models.user_profile import UserProfile


async def get_messages_between(
    db: AsyncSession,
    user_id: uuid.UUID,
    other_id: uuid.UUID,
    since: Optional[datetime] = None,
) -> list[Message]:
    """Return all messages between two users, oldest first.

    If `since` is given, only messages created after that timestamp are
    returned (used for polling delta updates).
    """
    stmt = select(Message).where(
        or_(
            and_(Message.sender_id == user_id, Message.recipient_id == other_id),
            and_(Message.sender_id == other_id, Message.recipient_id == user_id),
        )
    )
    if since is not None:
        stmt = stmt.where(Message.created_at > since)
    stmt = stmt.order_by(Message.created_at.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def mark_messages_read(db: AsyncSession, message_ids: list[uuid.UUID]) -> None:
    """Mark the given messages as read. No-op (no commit) if the list is empty,
    matching the original route behaviour of only issuing a write when needed."""
    if not message_ids:
        return
    await db.execute(
        update(Message)
        .where(Message.id.in_(message_ids))
        .values(is_read=True)
    )
    await db.commit()


async def create_message(
    db: AsyncSession,
    sender_id: uuid.UUID,
    recipient_id: uuid.UUID,
    content: str,
) -> Message:
    msg = Message(
        sender_id=sender_id,
        recipient_id=recipient_id,
        content=content,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def get_unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count(Message.id)).where(
            and_(Message.recipient_id == user_id, Message.is_read == False)  # noqa: E712
        )
    )
    return result.scalar_one() or 0


async def get_messages_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[Message]:
    """Return all messages involving this user (as sender or recipient), oldest first."""
    result = await db.execute(
        select(Message)
        .where(or_(Message.sender_id == user_id, Message.recipient_id == user_id))
        .order_by(Message.created_at.asc())
    )
    return list(result.scalars().all())


async def get_profiles_by_ids(
    db: AsyncSession, user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, UserProfile]:
    """Return a {user_id: UserProfile} map for the given user ids."""
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id.in_(user_ids))
    )
    return {p.user_id: p for p in result.scalars().all()}
