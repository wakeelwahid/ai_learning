import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.database.session import get_db
from app.schemas.ai import ContentUploadRequest, ContentUploadResponse
from app.services.content_service import ContentService

router = APIRouter(prefix="/ai", tags=["ai"])


# ── Legacy AI Content Upload (unchanged) ─────────────────────────────────────

@router.post("/content/questions", response_model=ContentUploadResponse, dependencies=[Depends(require_admin)])
async def upload_questions(body: ContentUploadRequest, db: AsyncSession = Depends(get_db)):
    svc    = ContentService(db)
    result = await svc.upload(chapter_id=str(body.chapter_id), content_type="questions",
                              title=body.title, content=body.content,
                              ingest_qdrant=body.ingest_qdrant, difficulty=body.difficulty)
    return ContentUploadResponse(**result)


@router.get("/content/questions", response_model=list[dict])
async def get_questions(chapter_id: uuid.UUID = Query(...), db: AsyncSession = Depends(get_db)):
    return await ContentService(db).get_content(str(chapter_id), "questions")


@router.post("/content/notes", response_model=ContentUploadResponse, dependencies=[Depends(require_admin)])
async def upload_notes(body: ContentUploadRequest, db: AsyncSession = Depends(get_db)):
    svc    = ContentService(db)
    result = await svc.upload(chapter_id=str(body.chapter_id), content_type="notes",
                              title=body.title, content=body.content,
                              ingest_qdrant=body.ingest_qdrant)
    return ContentUploadResponse(**result)


@router.get("/content/notes", response_model=list[dict])
async def get_notes(chapter_id: uuid.UUID = Query(...), db: AsyncSession = Depends(get_db)):
    return await ContentService(db).get_content(str(chapter_id), "notes")


@router.post("/content/practice-papers", response_model=ContentUploadResponse, dependencies=[Depends(require_admin)])
async def upload_practice(body: ContentUploadRequest, db: AsyncSession = Depends(get_db)):
    svc    = ContentService(db)
    result = await svc.upload(chapter_id=str(body.chapter_id), content_type="practice",
                              title=body.title, content=body.content,
                              ingest_qdrant=body.ingest_qdrant)
    return ContentUploadResponse(**result)


@router.get("/content/practice-papers", response_model=list[dict])
async def get_practice(chapter_id: uuid.UUID = Query(...), db: AsyncSession = Depends(get_db)):
    return await ContentService(db).get_content(str(chapter_id), "practice")


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str, db: AsyncSession = Depends(get_db)):
    return await ContentService(db).get_indexing_status(task_id)
