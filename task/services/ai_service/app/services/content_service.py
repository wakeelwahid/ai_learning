"""
AI Content Service — save to PostgreSQL + queue Qdrant indexing via Celery.

Flow:
1. Save content to PostgreSQL immediately (returns in <50ms).
2. If ingest_qdrant=True, dispatch a background Celery task that
   chunks → embeds → upserts into Qdrant.
3. Admin gets a task_id to poll for indexing progress.

The upload endpoint never blocks on embeddings or Qdrant — those are slow
(seconds to minutes for large documents) and run entirely in the worker.
"""
from celery.result import AsyncResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.crud import ai_crud
from app.tasks.indexing import index_content_task


class ContentService:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def upload(
        self,
        chapter_id: str,
        content_type: str,
        title: str,
        content: str,
        ingest_qdrant: bool = True,
        difficulty: str | None = None,
    ) -> dict:
        record = await ai_crud.create_content(
            self._db,
            chapter_id=chapter_id,
            content_type=content_type,
            title=title,
            content=content,
            difficulty=difficulty,
        )
        content_id = str(record.id)

        task_id: str | None = None
        if ingest_qdrant:
            result = index_content_task.delay(
                content_id=content_id,
                chapter_id=chapter_id,
                content_type=content_type,
                title=title,
                content=content,
                difficulty=difficulty,
            )
            task_id = result.id

        return {
            "id": content_id,
            "chapter_id": chapter_id,
            "title": title,
            "content_type": content_type,
            "chunks_indexed": None,         # Not yet — happens in background
            "task_id": task_id,
            "message": (
                "Saved to DB. Qdrant indexing queued — check task status for progress."
                if ingest_qdrant
                else "Saved to DB (Qdrant indexing skipped)."
            ),
        }

    async def get_content(self, chapter_id: str, content_type: str) -> list[dict]:
        rows = await ai_crud.get_content_by_chapter(self._db, chapter_id, content_type)
        return [
            {
                "id": str(r.id),
                "title": r.title,
                "content": r.content,
                "difficulty": r.difficulty,
                "qdrant_indexed": r.qdrant_indexed,
                "chunks_indexed": r.chunks_indexed,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]

    async def get_indexing_status(self, task_id: str) -> dict:
        """Check Celery task status for a queued indexing job."""
        result = AsyncResult(task_id, app=celery_app)
        return {
            "task_id": task_id,
            "status": result.status,
            "ready": result.ready(),
            "successful": result.successful() if result.ready() else None,
        }
