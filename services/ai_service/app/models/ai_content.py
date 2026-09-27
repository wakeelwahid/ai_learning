import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.database.base import Base


class AIContent(Base):
    """Stores admin-uploaded AI-generated questions, notes, and practice papers."""

    __tablename__ = "ai_content"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chapter_id = Column(String(36), nullable=False, index=True)
    content_type = Column(
        Enum("questions", "notes", "practice", name="ai_content_type"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    difficulty = Column(String(20), nullable=True)
    qdrant_indexed = Column(Boolean, default=False)
    chunks_indexed = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
