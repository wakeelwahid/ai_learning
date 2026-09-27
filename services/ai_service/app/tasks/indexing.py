"""
Celery tasks for background Qdrant indexing.

When admin uploads questions/notes/practice papers:
1. Content is saved to PostgreSQL immediately (fast, <50ms)
2. This task runs in background: chunk → embed → upsert to Qdrant
3. `ai_content.qdrant_indexed` is updated to True when done

The upload endpoint returns a task_id so the admin can poll status.
"""
import asyncio
import logging
import re
import uuid

import asyncpg

from app.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)

CHUNK_SIZE = 500  # chars * 4 ≈ tokens
OVERLAP = 50

_DB_URL = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://") if settings.DATABASE_URL else ""


def _split_text(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE * 4
        chunks.append(text[start:end].strip())
        start += (CHUNK_SIZE - OVERLAP) * 4
    return [c for c in chunks if len(c) > 20]


@celery_app.task(
    bind=True,
    name="app.tasks.indexing.index_content_task",
    max_retries=3,
    default_retry_delay=120,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    soft_time_limit=300,    # Phase 7: warn at 5 min (large doc indexing)
    time_limit=360,         # hard kill at 6 min
)
def index_content_task(
    self,
    content_id: str,
    chapter_id: str,
    content_type: str,
    title: str,
    content: str,
    difficulty: str | None = None,
):
    """
    Chunk → embed → upsert to Qdrant for a single AI content record.
    Updates `ai_content.qdrant_indexed` and `chunks_indexed` on completion.
    """
    async def _run():
        from app.services.embedding_service import EmbeddingService
        from app.services.qdrant_service import QdrantService

        embedder = EmbeddingService()
        qdrant = QdrantService()

        chunks = _split_text(content)
        if not chunks:
            logger.warning("No chunks for content_id=%s", content_id)
            return

        embeddings = await embedder.embed_batch(chunks)
        await qdrant.ensure_collection(len(embeddings[0]))

        points = [
            {
                "id": str(uuid.uuid4()),
                "text": chunk,
                "chapter_id": chapter_id,
                "content_type": content_type,
                "title": title,
                "difficulty": difficulty,
                "source_id": content_id,
            }
            for chunk in chunks
        ]
        await qdrant.upsert_chunks(points, embeddings)

        # Update DB record
        if _DB_URL:
            conn = await asyncpg.connect(_DB_URL)
            try:
                await conn.execute(
                    """
                    UPDATE ai_content
                    SET qdrant_indexed = true, chunks_indexed = $1
                    WHERE id = $2::uuid
                    """,
                    len(chunks),
                    content_id,
                )
            finally:
                await conn.close()

        logger.info(
            "Indexed %d chunks for content_id=%s (chapter=%s, type=%s)",
            len(chunks), content_id, chapter_id, content_type,
        )

    asyncio.run(_run())
