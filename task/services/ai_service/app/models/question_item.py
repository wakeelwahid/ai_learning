import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class QuestionItem(Base):
    """
    Flat question rows extracted from GeneratedPaper content.

    Each feature (questions / quiz / custom) has its own independent rows so
    GET /ai/questions?feature=quiz returns ONLY questions from quiz_paper type
    papers, never mixing with general questions or custom content.

    Populated automatically when a paper is saved as PUBLISHED + verified.
    """
    __tablename__ = "question_items"

    id:             Mapped[uuid.UUID]  = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    feature:        Mapped[str]        = mapped_column(String(20), nullable=False, index=True)   # "questions" | "quiz" | "custom"
    question:       Mapped[str]        = mapped_column(String, nullable=False)
    options:        Mapped[list | None] = mapped_column(JSONB, nullable=True)    # ["a) ...", "b) ...", ...]
    correct_option: Mapped[str | None] = mapped_column(String(4), nullable=True) # "a" | "b" | "c" | "d"
    answer:         Mapped[str | None] = mapped_column(String, nullable=True)
    explanation:    Mapped[str | None] = mapped_column(String, nullable=True)
    board:          Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    class_num:      Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    subject:        Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    chapter:        Mapped[str | None] = mapped_column(String(200), nullable=True)
    paper_id:       Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True, index=True)
    created_at:     Mapped[datetime]   = mapped_column(DateTime, default=datetime.utcnow)
