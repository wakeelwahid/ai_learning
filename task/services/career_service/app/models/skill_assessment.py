import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Index, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class SkillAssessment(Base):
    __tablename__ = "skill_assessments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:          Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    career_id:        Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    ready_score:      Mapped[float]     = mapped_column(Float, nullable=False, default=0.0)
    skill_scores:     Mapped[dict]      = mapped_column(JSONB, nullable=False, default=dict)
    gaps:             Mapped[list]      = mapped_column(JSONB, nullable=False, default=list)
    recommendations:  Mapped[list]      = mapped_column(JSONB, nullable=False, default=list)
    learning_path:    Mapped[list]      = mapped_column(JSONB, nullable=False, default=list)
    assessed_at:      Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_skill_assessments_user_career", "user_id", "career_id"),
    )
