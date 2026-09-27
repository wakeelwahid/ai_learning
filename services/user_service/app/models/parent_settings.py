import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class StudyTimeLimit(Base):
    """Daily study-time limit a parent sets for a linked child."""

    __tablename__ = "study_time_limits"
    __table_args__ = (UniqueConstraint("parent_user_id", "child_user_id", name="uq_study_limit_parent_child"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    child_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    # Minutes per day; 0 means "No limit"
    daily_limit_minutes: Mapped[int] = mapped_column(Integer, default=120, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
