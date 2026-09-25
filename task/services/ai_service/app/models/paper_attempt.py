"""
PaperAttempt — one student's attempt at a GeneratedPaper.

Subject/chapter/board/class/paper_type/total_marks are denormalised from the
paper at write time: a parent's history has to survive the paper being deleted.
"""
import uuid

from sqlalchemy import Column, DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database.base import Base


class PaperAttempt(Base):
    __tablename__ = "paper_attempts"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id        = Column(UUID(as_uuid=True), nullable=False, index=True)
    paper_id       = Column(UUID(as_uuid=True), nullable=False, index=True)  # generated_papers.id

    # Denormalised from the paper
    paper_type     = Column(String(30),  nullable=True)
    subject        = Column(String(100), nullable=True)
    chapter        = Column(String(200), nullable=True)
    board          = Column(String(50),  nullable=True)
    class_num      = Column(Integer,     nullable=True)
    total_marks    = Column(Integer,     nullable=True)

    score          = Column(Float,   nullable=False, default=0)
    percentage     = Column(Float,   nullable=False, default=0)
    correct_count  = Column(Integer, nullable=False, default=0)
    wrong_count    = Column(Integer, nullable=False, default=0)
    time_taken_sec = Column(Integer, nullable=True)

    status         = Column(String(20), nullable=False, default="completed")
    # in_progress / completed / abandoned

    answers        = Column(JSONB, nullable=True)   # {question_index: given_answer}

    started_at     = Column(DateTime(timezone=True), nullable=True)
    completed_at   = Column(DateTime(timezone=True), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
