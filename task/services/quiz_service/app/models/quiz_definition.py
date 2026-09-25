import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class QuestionType(str, enum.Enum):
    MCQ        = "mcq"
    TRUE_FALSE = "true_false"
    FILL_BLANK = "fill_blank"
    SUBJECTIVE = "subjective"


class QuizType(str, enum.Enum):
    CHAPTER    = "chapter"
    MOCK_TEST  = "mock_test"
    PRACTICE   = "practice"
    ADAPTIVE   = "adaptive"


class Quiz(Base):
    __tablename__ = "quizzes"

    id:               Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title:            Mapped[str]          = mapped_column(String(200), nullable=False)
    chapter_id:       Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    subject_id:       Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    quiz_type:        Mapped[QuizType]     = mapped_column(Enum(QuizType), nullable=False)
    duration_minutes: Mapped[int]          = mapped_column(Integer, nullable=False, default=30)
    total_marks:      Mapped[int]          = mapped_column(Integer, nullable=False, default=0)
    passing_marks:    Mapped[int]          = mapped_column(Integer, nullable=False, default=0)
    is_premium:       Mapped[bool]         = mapped_column(Boolean, default=False)
    is_active:        Mapped[bool]         = mapped_column(Boolean, default=True)
    created_at:       Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Cache routing metadata — enables keys like quiz:cbse:10:physics:motion
    board:        Mapped[str | None] = mapped_column(String(50),  nullable=True)
    class_num:    Mapped[int | None] = mapped_column(Integer,     nullable=True)
    subject_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    chapter_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    questions: Mapped[list["Question"]] = relationship(back_populates="quiz")


class Question(Base):
    __tablename__ = "questions"

    id:            Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quiz_id:       Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), ForeignKey("quizzes.id"), nullable=False)
    text:          Mapped[str]             = mapped_column(Text, nullable=False)
    question_type: Mapped[QuestionType]    = mapped_column(Enum(QuestionType), nullable=False)
    options:       Mapped[dict | None]     = mapped_column(JSONB, nullable=True)
    correct_answer: Mapped[str]            = mapped_column(Text, nullable=False)
    explanation:   Mapped[str | None]      = mapped_column(Text, nullable=True)
    marks:         Mapped[int]             = mapped_column(Integer, nullable=False, default=1)
    negative_marks: Mapped[float]          = mapped_column(Float,   nullable=False, default=0.0)
    sequence:      Mapped[int]             = mapped_column(Integer, nullable=False, default=0)
    topic_id:      Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    quiz:          Mapped["Quiz"]          = relationship(back_populates="questions")
