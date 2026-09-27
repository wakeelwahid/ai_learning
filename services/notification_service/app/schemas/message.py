"""
Pydantic schemas for message threading endpoints.
"""
import uuid
from datetime import datetime
from pydantic import BaseModel, Field

from app.models.message import SenderRole


# ── Thread schemas ─────────────────────────────────────────────────────────────

class ThreadSummary(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str
    sender_role: SenderRole
    sender_avatar: str | None
    last_message_preview: str | None
    last_message_at: datetime | None
    unread_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ThreadListResponse(BaseModel):
    threads: list[ThreadSummary]
    total: int


# ── Message schemas ────────────────────────────────────────────────────────────

class MessageOut(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    sender_id: uuid.UUID
    sender_role: SenderRole
    content: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ThreadDetailResponse(BaseModel):
    thread: ThreadSummary
    messages: list[MessageOut]


# ── Request schemas ────────────────────────────────────────────────────────────

class SendMessageRequest(BaseModel):
    # ThreadMessage.content is unbounded Text; min_length guards against
    # empty strings (the route also rejects whitespace-only content).
    content: str = Field(min_length=1, max_length=5000)


class CreateThreadRequest(BaseModel):
    student_id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str = Field(min_length=1, max_length=200)   # MessageThread.sender_name is String(200)
    sender_role: SenderRole = SenderRole.PARENT
    sender_avatar: str | None = Field(default=None, max_length=10)  # MessageThread.sender_avatar is String(10)
    initial_message: str | None = Field(default=None, min_length=1, max_length=5000)
