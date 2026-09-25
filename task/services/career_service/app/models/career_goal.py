import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class CareerGoal(Base):
    __tablename__ = "career_goals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:    Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    career_id:  Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    progress:   Mapped[float]     = mapped_column(Float, nullable=False, default=0.0)
    is_primary: Mapped[bool]      = mapped_column(Boolean, nullable=False, default=False)
    notes:      Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_career_goals_user_career", "user_id", "career_id", unique=True),
    )
