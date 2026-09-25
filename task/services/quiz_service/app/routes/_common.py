import uuid

from app.workers.event_publisher import publish_event


async def trigger_cache_rebuild(quiz_id: uuid.UUID) -> None:
    await publish_event("quiz.cache_rebuild", {"quiz_id": str(quiz_id)})
