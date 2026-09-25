"""
CRUD helpers for message threading.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.message import MessageThread, SenderRole, ThreadMessage


async def get_threads_for_student(
    db: AsyncSession,
    student_id: uuid.UUID,
) -> list[MessageThread]:
    """Return all message threads for a student, newest activity first."""
    result = await db.execute(
        select(MessageThread)
        .where(MessageThread.student_id == student_id)
        .order_by(MessageThread.last_message_at.desc().nullslast())
    )
    return result.scalars().all()


async def get_thread(
    db: AsyncSession,
    thread_id: uuid.UUID,
) -> MessageThread | None:
    """Fetch a thread with all its messages eagerly loaded."""
    result = await db.execute(
        select(MessageThread)
        .where(MessageThread.id == thread_id)
        .options(selectinload(MessageThread.messages))
    )
    return result.scalar_one_or_none()


async def create_thread(
    db: AsyncSession,
    student_id: uuid.UUID,
    sender_id: uuid.UUID,
    sender_name: str,
    sender_role: SenderRole,
    sender_avatar: str | None = None,
    initial_message: str | None = None,
) -> MessageThread:
    """Create a new message thread, optionally with a first message."""
    thread = MessageThread(
        student_id=student_id,
        sender_id=sender_id,
        sender_name=sender_name,
        sender_role=sender_role,
        sender_avatar=sender_avatar,
        last_message_preview=initial_message,
        last_message_at=datetime.now(timezone.utc) if initial_message else None,
        unread_count=1 if initial_message else 0,
    )
    db.add(thread)
    await db.flush()

    if initial_message:
        msg = ThreadMessage(
            thread_id=thread.id,
            sender_id=sender_id,
            sender_role=sender_role,
            content=initial_message,
            is_read=False,
        )
        db.add(msg)

    await db.commit()
    await db.refresh(thread)
    return thread


async def add_message_to_thread(
    db: AsyncSession,
    thread_id: uuid.UUID,
    sender_id: uuid.UUID,
    sender_role: SenderRole,
    content: str,
) -> ThreadMessage:
    """Append a message to an existing thread and update its denormalised fields."""
    msg = ThreadMessage(
        thread_id=thread_id,
        sender_id=sender_id,
        sender_role=sender_role,
        content=content,
        is_read=False,
    )
    db.add(msg)
    await db.flush()

    # Update thread preview and unread count (only for non-student senders)
    increment = 1 if sender_role != SenderRole.STUDENT else 0
    thread = await db.get(MessageThread, thread_id)
    if thread:
        thread.last_message_preview = content[:300]
        thread.last_message_at = datetime.now(timezone.utc)
        if increment:
            thread.unread_count = (thread.unread_count or 0) + increment

    await db.commit()
    await db.refresh(msg)
    return msg


async def mark_thread_read(
    db: AsyncSession,
    thread_id: uuid.UUID,
) -> int:
    """Mark all messages in the thread as read and reset the unread counter."""
    result = await db.execute(
        update(ThreadMessage)
        .where(ThreadMessage.thread_id == thread_id, ThreadMessage.is_read == False)  # noqa: E712
        .values(is_read=True)
        .returning(ThreadMessage.id)
    )
    updated = len(result.fetchall())

    thread = await db.get(MessageThread, thread_id)
    if thread:
        thread.unread_count = 0

    await db.commit()
    return updated
