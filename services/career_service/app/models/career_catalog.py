import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Career(Base):
    __tablename__ = "careers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title:             Mapped[str]       = mapped_column(String(150), nullable=False, index=True)
    category:          Mapped[str]       = mapped_column(String(80),  nullable=False, index=True)
    slug:              Mapped[str]       = mapped_column(String(100), nullable=False, unique=True, index=True)
    overview:          Mapped[str]       = mapped_column(Text, nullable=False)
    required_subjects: Mapped[list]      = mapped_column(JSONB, nullable=False, default=list)
    skills_required:   Mapped[list]      = mapped_column(JSONB, nullable=False, default=list)
    roadmap_steps:     Mapped[list]      = mapped_column(JSONB, nullable=False, default=list)
    salary_range:      Mapped[dict]      = mapped_column(JSONB, nullable=False, default=dict)
    demand_level:      Mapped[str]       = mapped_column(String(20), nullable=False, default="high")
    top_colleges:      Mapped[list]      = mapped_column(JSONB, nullable=False, default=list)
    entrance_exams:    Mapped[list]      = mapped_column(JSONB, nullable=False, default=list)
    future_demand:     Mapped[str]       = mapped_column(Text, nullable=True)
    icon:              Mapped[str | None] = mapped_column(String(50), nullable=True)
    color:             Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active:         Mapped[bool]      = mapped_column(Boolean, nullable=False, default=True)
    created_at:        Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_careers_category_active", "category", "is_active"),
    )
