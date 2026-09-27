"""Nightly refresh of the parent-RAG student index.

Parents ask about yesterday's homework, so the index cannot only be rebuilt
when someone happens to open the chat. This walks every student who has an
approved parent link and re-indexes them.

Only students with a linked parent are indexed — the index exists solely to
answer parents' questions, so indexing anyone else would be wasted work on
data nobody can query.
"""
import asyncio
import logging
import uuid

import httpx
import redis.asyncio as aioredis

from app.celery_app import celery_app
from app.core.config import settings
from app.services.student_indexer import StudentIndexer

logger = logging.getLogger(__name__)


async def _linked_students() -> list[uuid.UUID]:
    """Every student who has at least one approved parent link."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{settings.USER_SERVICE_URL}/api/v1/users/internal/parent-links/approved-students",
            headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
        )
        resp.raise_for_status()
        return [uuid.UUID(s) for s in resp.json().get("student_ids", [])]


async def _reindex_all() -> dict:
    redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        students = await _linked_students()
        indexed = failed = 0
        for student_id in students:
            try:
                await StudentIndexer(redis).index_student(student_id, force=True)
                indexed += 1
            except Exception as exc:
                # One bad student must not stop the nightly run.
                logger.warning("Parent-RAG index failed for %s: %s", student_id, exc)
                failed += 1
        return {"students": len(students), "indexed": indexed, "failed": failed}
    finally:
        await redis.aclose()


@celery_app.task(name="app.tasks.parent_index.refresh_parent_rag_index", queue="ai.embedding")
def refresh_parent_rag_index() -> dict:
    result = asyncio.run(_reindex_all())
    logger.info("Parent-RAG nightly index: %s", result)
    return result
