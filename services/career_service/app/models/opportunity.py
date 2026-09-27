import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class OpportunityCategory(str, enum.Enum):
    GOVERNMENT_JOBS = "government_jobs"
    SCHOLARSHIPS    = "scholarships"
    ENTRANCE_EXAMS  = "entrance_exams"
    INTERNSHIPS     = "internships"
    OLYMPIADS       = "olympiads"


class Opportunity(Base):
    __tablename__ = "opportunities"

    id:                  Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category:            Mapped[OpportunityCategory] = mapped_column(Enum(OpportunityCategory), nullable=False, index=True)
    subcategory:         Mapped[str]           = mapped_column(String(80),  nullable=False, index=True)
    title:               Mapped[str]           = mapped_column(String(200), nullable=False)
    organization:        Mapped[str]           = mapped_column(String(200), nullable=False)
    description:         Mapped[str | None]    = mapped_column(Text, nullable=True)
    total_posts:         Mapped[int | None]    = mapped_column(Integer, nullable=True)
    qualification:       Mapped[str | None]    = mapped_column(String(200), nullable=True)
    age_min:             Mapped[int | None]    = mapped_column(Integer, nullable=True)
    age_max:             Mapped[int | None]    = mapped_column(Integer, nullable=True)
    salary_min:          Mapped[int | None]    = mapped_column(Integer, nullable=True)
    salary_max:          Mapped[int | None]    = mapped_column(Integer, nullable=True)
    application_fee:     Mapped[int | None]    = mapped_column(Integer, nullable=True)
    last_date:           Mapped[date]          = mapped_column(Date, nullable=False, index=True)
    exam_date:           Mapped[date | None]   = mapped_column(Date, nullable=True)
    selection_process:   Mapped[list]          = mapped_column(JSONB, nullable=False, default=list)
    official_url:        Mapped[str]           = mapped_column(String(500), nullable=False)
    notification_pdf_url: Mapped[str | None]   = mapped_column(String(500), nullable=True)
    is_active:           Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)
    is_featured:         Mapped[bool]          = mapped_column(Boolean, nullable=False, default=False)
    created_at:          Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:          Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
