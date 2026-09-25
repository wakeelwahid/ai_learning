import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.crud import ai_crud
from app.database.session import get_db
from app.schemas.ai import JobCompleteRequest, JobFailRequest, JobListResponse, JobResponse, JobStartRequest

router = APIRouter(prefix="/ai", tags=["ai"])


# ── Ingestion Job Management ──────────────────────────────────────────────────

@router.get("/jobs/pending", dependencies=[Depends(require_admin)])
async def get_pending_jobs(
    limit: int = Query(default=5, le=20),
    db:    AsyncSession = Depends(get_db),
):
    """Local worker polls this endpoint to get work."""
    jobs = await ai_crud.get_pending_jobs(db, limit=limit)
    return {
        "jobs": [
            {
                "id":           str(j.id),
                "file_name":    j.file_name,
                "file_url":     j.file_url,
                "file_type":    j.file_type,
                "board":        j.board,
                "class_num":    j.class_num,
                "subject":      j.subject,
                "chapter":      j.chapter,
                "topic":        j.topic,
                "content_type": getattr(j, "content_type", "syllabus"),
                "collection":   getattr(j, "collection", "school_subjects"),
                "status":       j.status,
                "created_at":   j.created_at.isoformat(),
            }
            for j in jobs
        ],
        "count": len(jobs),
    }


@router.get("/jobs/{job_id}", response_model=JobResponse, dependencies=[Depends(require_admin)])
async def get_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get a single ingestion job by ID."""
    job = await ai_crud.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse.model_validate(job)


@router.get("/jobs", response_model=JobListResponse, dependencies=[Depends(require_admin)])
async def list_jobs(
    status: Literal["PENDING", "PROCESSING", "COMPLETED", "FAILED"] | None = Query(default=None),
    limit:  int        = Query(default=50, ge=1, le=200),
    db:     AsyncSession = Depends(get_db),
):
    """Admin: list all ingestion jobs."""
    jobs = await ai_crud.list_jobs(db, status=status, limit=limit)
    return JobListResponse(
        jobs=[JobResponse.model_validate(j) for j in jobs],
        total=len(jobs),
    )


@router.post("/jobs/{job_id}/start", dependencies=[Depends(require_admin)])
async def start_job(
    job_id: uuid.UUID,
    body:   JobStartRequest,
    db:     AsyncSession = Depends(get_db),
):
    await ai_crud.start_job(db, job_id, body.worker_id)
    return {"job_id": str(job_id), "status": "PROCESSING"}


@router.post("/jobs/{job_id}/complete", dependencies=[Depends(require_admin)])
async def complete_job(
    job_id: uuid.UUID,
    body:   JobCompleteRequest,
    db:     AsyncSession = Depends(get_db),
):
    await ai_crud.complete_job(db, job_id, body.chunks_indexed)
    return {"job_id": str(job_id), "status": "COMPLETED", "chunks_indexed": body.chunks_indexed}


@router.post("/jobs/{job_id}/fail", dependencies=[Depends(require_admin)])
async def fail_job(
    job_id: uuid.UUID,
    body:   JobFailRequest,
    db:     AsyncSession = Depends(get_db),
):
    await ai_crud.fail_job(db, job_id, body.error_message)
    return {"job_id": str(job_id), "status": "FAILED"}
