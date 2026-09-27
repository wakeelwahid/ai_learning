"""Fire-and-forget XP awards to gamification_service for career actions.

Uses the real end-user JWT (career_service always has one — every route here
requires auth) against the public POST /gamification/xp/award endpoint, the
same one the frontend calls directly for other events. Never raises — a
missed XP award must never fail the underlying career action.
"""
import logging
import uuid

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


async def award_xp(user_id: uuid.UUID, event: str, bearer_token: str, reference_id: str | None = None) -> None:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/xp/award",
                json={"user_id": str(user_id), "event": event, "reference_id": reference_id},
                headers={"Authorization": bearer_token},
            )
    except Exception as exc:
        logger.warning("Failed to award XP (%s) via gamification service: %s", event, exc)
