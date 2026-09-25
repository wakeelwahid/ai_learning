import base64
import io
import logging
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import require_admin
from app.crud import ai_crud
from app.database.session import get_db
from app.tasks.upload_task import process_upload_task

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])


# ── Admin: File Upload → IngestionJob ─────────────────────────────────────────

@router.post("/admin/upload", dependencies=[Depends(require_admin)])
async def admin_upload(
    file:          UploadFile = File(...),
    board:         str | None = Form(default=None, max_length=50),
    class_num:     int | None = Form(default=None, ge=1, le=12),
    subject:       str | None = Form(default=None, max_length=100),
    chapter:       str | None = Form(default=None, max_length=200),
    topic:         str | None = Form(default=None, max_length=200),
    content_type:  Literal["syllabus", "general_knowledge", "current_affairs", "custom"] | None = Form(default="syllabus"),
    document_type: Literal["pdf", "ppt", "notes", "question_bank", "mcq_bank", "exercise_solutions", "sample_paper"] | None = Form(default=None),
    collection:    str | None = Form(default=None, max_length=100),
    db:            AsyncSession = Depends(get_db),
):
    """
    Admin uploads a PDF/PPTX/DOCX/TXT file. Processing is fully automatic and
    self-contained (no external worker):

      1. Create IngestionJob (PROCESSING)
      2. Background: extract text → chunk → embed → Qdrant (subject/class/chapter
         metadata) → auto-generate quiz → auto-verify → save → mark COMPLETED.

    Admin polls GET /ai/jobs/{id} for status + verification result.
    """
    # Strip any path separators/traversal from the client-supplied filename
    # before it's used anywhere (MinIO object key, DB fields) — a raw
    # UploadFile.filename is attacker-controlled input, not a trusted path.
    safe_filename = Path(file.filename or "upload").name

    allowed = {"pdf", "pptx", "docx", "txt", "md"}
    ext = safe_filename.rsplit(".", 1)[-1].lower() if "." in safe_filename else ""
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}. Allowed: {sorted(allowed)}")

    # Cross-check the declared MIME type against the extension — an
    # extension-only allowlist is trivially spoofed by renaming any file.
    _mime_by_ext = {
        "pdf":  {"application/pdf"},
        "pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
        "docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
        "txt":  {"text/plain"},
        "md":   {"text/markdown", "text/plain", "text/x-markdown"},
    }
    if file.content_type and file.content_type not in _mime_by_ext.get(ext, set()):
        raise HTTPException(
            status_code=400,
            detail=f"File content type '{file.content_type}' doesn't match the .{ext} extension.",
        )

    # Reject before buffering the whole file into memory — an unbounded
    # `await file.read()` on a huge upload (doubled again by the base64
    # encoding for the Celery task payload below) is an easy memory-
    # exhaustion vector, unlike user_service's avatar upload which already
    # caps at 2MB.
    MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25MB — generous for a syllabus PDF/PPTX
    file_bytes = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large — max {MAX_UPLOAD_BYTES // (1024*1024)}MB.")

    # Best-effort archival to MinIO (optional; pipeline does not depend on it)
    file_url = await store_to_minio(safe_filename, file_bytes, file.content_type)

    # Syllabus content must land in the collection the student RAG search reads
    # (QDRANT_COLLECTION_SYLLABUS), so uploads are immediately queryable.
    _collection_map = {
        "syllabus":          settings.QDRANT_COLLECTION_SYLLABUS,
        "general_knowledge": "general_knowledge",
        "current_affairs":   "current_affairs",
    }
    resolved_collection = collection or _collection_map.get(content_type or "syllabus", settings.QDRANT_COLLECTION_SYLLABUS)

    job = await ai_crud.create_job(db, {
        "file_name":    safe_filename,
        "file_url":     file_url,
        "file_type":    ext,
        "file_size":    len(file_bytes),
        "board":        board,
        "class_num":    class_num,
        "subject":      subject.lower() if subject else None,
        "chapter":      chapter,
        "topic":        topic,
        "content_type": content_type or "syllabus",
        "document_type": (document_type or ext).lower(),
        "collection":   resolved_collection,
        "status":       "PROCESSING",
    })

    # Enqueue on the Celery queue (ai_worker) — extract → chunk → embed → Qdrant
    # → auto-generate quiz → verify → update IngestionJob.status in DB.
    process_upload_task.delay(str(job.id), base64.b64encode(file_bytes).decode(), safe_filename)

    return {
        "job_id":    str(job.id),
        "file_name": job.file_name,
        "status":    "PROCESSING",
        "message":   "File received. Queued for RAG ingestion + quiz generation.",
    }


async def store_to_minio(filename: str, data: bytes, content_type: str | None) -> str:
    """Upload file to MinIO and return a presigned download URL."""
    try:
        from minio import Minio
        from minio.error import S3Error

        client = Minio(
            settings.MINIO_ENDPOINT.replace("http://", "").replace("https://", ""),
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_ENDPOINT.startswith("https"),
        )
        bucket = settings.MINIO_BUCKET
        try:
            if not client.bucket_exists(bucket):
                client.make_bucket(bucket)
        except S3Error:
            pass

        obj_name = f"ingestion/{uuid.uuid4()}/{filename}"
        client.put_object(
            bucket, obj_name,
            io.BytesIO(data), len(data),
            content_type=content_type or "application/octet-stream",
        )
        # 7-day presigned URL so worker can download
        url = client.presigned_get_object(bucket, obj_name, expires=timedelta(days=7))
        return url
    except Exception as exc:
        logger.warning("MinIO unavailable, returning placeholder URL: %s", exc)
        return f"minio://{settings.MINIO_BUCKET}/ingestion/{filename}"
