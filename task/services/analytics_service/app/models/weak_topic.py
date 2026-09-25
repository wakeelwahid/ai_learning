import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class WeakTopicAnalysis(Base):
    __tablename__ = "weak_topic_analysis"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    topic_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    correct_answers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    accuracy: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Same SELECT-then-INSERT race as StudentProgress (see its __table_args__
    # comment) — concurrent /analytics/topic-attempt calls for the same
    # (user_id, topic_id) could otherwise create duplicate rows.
    __table_args__ = (
        UniqueConstraint("user_id", "topic_id", name="uq_weak_topic_analysis_user_topic"),
    )
