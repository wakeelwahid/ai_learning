"""Fire-and-forget XP awards to gamification_service for career actions.

career_service has already verified the event really happened (a goal was set,
a skill-gap assessment completed) before calling, so this uses the
service-to-service POST /gamification/internal/event-xp/award (require_internal,
X-Internal-Secret) rather than the public /xp/award — which is now admin-only,
so an end-user's own JWT can never pick an event and mint XP for themselves.
Never raises — a missed XP award must never fail the underlying career action.
"""
import logging
import uuid

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


async def award_xp(user_id: uuid.UUID, event: str, bearer_token: str | None = None, reference_id: str | None = None) -> None:
    # bearer_token is accepted for call-site compatibility but no longer used:
    # the internal route is network+secret gated, not end-user-JWT gated.
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/event-xp/award",
                json={"user_id": str(user_id), "event": event, "reference_id": reference_id},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception as exc:
        logger.warning("Failed to award XP (%s) via gamification service: %s", event, exc)
