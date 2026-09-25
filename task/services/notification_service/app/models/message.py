"""
SQLAlchemy models for parent-to-student message threading.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class SenderRole(str, enum.Enum):
    PARENT = "parent"
    TEACHER = "teacher"
    STUDENT = "student"


class MessageThread(Base):
    """A conversation thread between a parent/teacher and a student."""

    __tablename__ = "message_threads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    sender_name: Mapped[str] = mapped_column(String(200), nullable=False)
    sender_role: Mapped[SenderRole] = mapped_column(Enum(SenderRole), nullable=False, default=SenderRole.PARENT)
    sender_avatar: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Denormalised for fast list rendering
    last_message_preview: Mapped[str | None] = mapped_column(String(300), nullable=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    unread_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    messages: Mapped[list["ThreadMessage"]] = relationship(
        "ThreadMessage", back_populates="thread", order_by="ThreadMessage.created_at"
    )


class ThreadMessage(Base):
    """A single message inside a thread."""

    __tablename__ = "thread_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("message_threads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    sender_role: Mapped[SenderRole] = mapped_column(Enum(SenderRole), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    thread: Mapped["MessageThread"] = relationship("MessageThread", back_populates="messages")
