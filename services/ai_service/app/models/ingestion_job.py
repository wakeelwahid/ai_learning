"""
IngestionJob — tracks admin file upload → local Ollama worker → Qdrant pipeline.

Status flow:  PENDING → PROCESSING → COMPLETED
                                   → FAILED
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.database.base import Base


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_name     = Column(String(500), nullable=False)
    file_url      = Column(Text, nullable=False)          # MinIO presigned or public URL
    file_type     = Column(String(10), nullable=False)    # pdf / docx / txt / xlsx / zip
    file_size     = Column(Integer, nullable=True)        # bytes

    # Content category + Qdrant collection routing
    content_type  = Column(String(50), nullable=True, default="syllabus")
    # syllabus | general_knowledge | current_affairs | custom
    collection    = Column(String(100), nullable=True, default="school_subjects")

    # Curriculum metadata — used for Qdrant payload + cache keys
    board         = Column(String(50),  nullable=True)
    class_num     = Column(Integer,     nullable=True)
    subject       = Column(String(100), nullable=True)
    chapter       = Column(String(200), nullable=True)
    topic         = Column(String(200), nullable=True)
    # Document kind: pdf | ppt | notes | question_bank | mcq_bank | exercise_solutions | sample_paper
    document_type = Column(String(40), nullable=True)

    # Job lifecycle
    status        = Column(String(20), nullable=False, default="PENDING", index=True)
    # PENDING / PROCESSING / COMPLETED / FAILED
    worker_id     = Column(String(100), nullable=True)    # local worker hostname
    chunks_indexed = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)

    created_at    = Column(DateTime, default=datetime.utcnow)
    started_at    = Column(DateTime, nullable=True)
    completed_at  = Column(DateTime, nullable=True)
