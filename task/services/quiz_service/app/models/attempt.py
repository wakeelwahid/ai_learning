import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id:                 Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:            Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    quiz_id:            Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), ForeignKey("quizzes.id"), nullable=False)
    status:             Mapped[str]             = mapped_column(String(20), nullable=False, default="in_progress")
    score:              Mapped[float]           = mapped_column(Float, nullable=False, default=0.0)
    total_marks:        Mapped[int]             = mapped_column(Integer, nullable=False, default=0)
    percentage:         Mapped[float]           = mapped_column(Float, nullable=False, default=0.0)
    time_taken_seconds: Mapped[int | None]      = mapped_column(Integer, nullable=True)
    started_at:         Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at:       Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    answers:            Mapped[list["QuizAnswer"]] = relationship(back_populates="attempt")


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"

    id:           Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id:   Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("quiz_attempts.id"), nullable=False)
    question_id:  Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False)
    user_answer:  Mapped[str | None]     = mapped_column(Text, nullable=True)
    is_correct:   Mapped[bool | None]    = mapped_column(Boolean, nullable=True)
    marks_awarded: Mapped[float]         = mapped_column(Float, nullable=False, default=0.0)
    attempt:      Mapped["QuizAttempt"]  = relationship(back_populates="answers")
