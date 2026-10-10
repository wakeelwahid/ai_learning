"""Best-effort client for content_service's board/class cache.

content_service caches each student's board + class (USER_BC_CACHE_TTL) to
serve /content/my-catalog. When board/class change here, that entry must be
dropped so the Learn tab shows the new curriculum immediately. Failure only
means the old value lives until the TTL expires — never fail the profile save.
"""
import logging
import uuid

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


async def invalidate_board_class_cache(user_id: uuid.UUID) -> None:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.delete(
                f"{settings.CONTENT_SERVICE_URL}/api/v1/content/internal/user-bc-cache/{user_id}",
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code >= 400:
            logger.warning("Board/class cache invalidation for %s returned %s", user_id, resp.status_code)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Board/class cache invalidation for %s failed — %s", user_id, exc)
