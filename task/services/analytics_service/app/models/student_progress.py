import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class StudentProgress(Base):
    __tablename__ = "student_progress"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    chapter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    videos_watched: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quizzes_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_quiz_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    completion_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    weak_topics: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Without this, concurrent upsert_progress() calls for the same
    # (user_id, chapter_id) race a SELECT-then-INSERT and can create
    # duplicate rows — reproduced live: 10 concurrent identical requests
    # created 2 rows instead of 1. This constraint plus the ON CONFLICT
    # upsert in progress_crud.upsert_progress() closes that race atomically.
    __table_args__ = (
        UniqueConstraint("user_id", "chapter_id", name="uq_student_progress_user_chapter"),
    )
