"""
GeneratedPaper — quiz papers and revision papers created by the local Ollama worker.

The worker generates structured JSON content locally (Ollama LLM) and dumps it
to the live server via POST /api/v1/ai/papers  or  POST /api/v1/ai/papers/bulk.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database.base import Base


class GeneratedPaper(Base):
    __tablename__ = "generated_papers"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    paper_type   = Column(String(30), nullable=False, index=True)
    # quiz_paper / revision_paper / practice_paper / mock_test

    # Curriculum routing
    board        = Column(String(50),  nullable=True, index=True)
    class_num    = Column(Integer,     nullable=True, index=True)
    subject      = Column(String(100), nullable=True, index=True)
    chapter      = Column(String(200), nullable=True)
    topic        = Column(String(200), nullable=True)

    title        = Column(String(300), nullable=False)
    difficulty   = Column(String(20),  nullable=True)   # easy / medium / hard / mixed
    total_marks  = Column(Integer,     nullable=True)
    duration_min = Column(Integer,     nullable=True)

    # The full structured paper as JSON
    content      = Column(JSONB, nullable=False)

    generated_by = Column(String(50),  nullable=False, default="ollama_local")
    # ollama_local / groq_remote / claude_remote

    source_job_id = Column(UUID(as_uuid=True), nullable=True)  # FK → ingestion_jobs.id
    status        = Column(String(20), nullable=False, default="PUBLISHED")
    # DRAFT / PUBLISHED / ARCHIVED

    # True once the generated MCQs pass auto-verification (structure + answer-in-options)
    verified     = Column(Boolean, nullable=False, default=False)

    created_at   = Column(DateTime, default=datetime.utcnow, server_default=func.now())
