"""
Cross-service side-effect calls into gamification_service — battle stats
upserts, XP awards, friend-challenge stake settlement, XP lookups and the
friend-activity feed. Composed into BattleLifecycleService (XP eligibility
on join) and BattleGameplayService (payouts at finish).
"""
import logging
import uuid

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud import gameplay_crud
from app.models.participant import BattleParticipant

logger = logging.getLogger(__name__)


class BattleGamificationClient:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update_stats(self, user_id: uuid.UUID, part: BattleParticipant) -> None:
        await gameplay_crud.upsert_battle_stats(self.db, user_id, part)

    async def award_xp(self, user_id: uuid.UUID, xp: int, reference_id: str) -> None:
        # /internal/xp/apply is network-gated (require_internal) and takes a
        # computed amount — the public /xp/award endpoint needs an end-user JWT
        # and a fixed event, neither of which exists at this call site.
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/xp/apply",
                    json={"user_id": str(user_id), "amount": xp, "reference_id": reference_id},
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception as exc:
            logger.warning("Failed to award XP via gamification service: %s", exc)

    async def settle_challenge(self, winner_id: uuid.UUID, loser_id: uuid.UUID, stake_xp: int, reference_id: str) -> None:
        """Settle a friend-challenge stake battle in one gamification call:
        winner +stake XP and EduPoints, loser −stake (floored at 0)."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/challenge-result",
                    json={
                        "winner_user_id": str(winner_id),
                        "loser_user_id": str(loser_id),
                        "stake_xp": stake_xp,
                        "reference_id": reference_id,
                    },
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception as exc:
            logger.warning("Failed to settle challenge stakes via gamification service: %s", exc)

    async def get_user_xp(self, user_id: uuid.UUID) -> int | None:
        """Current total XP for a user via gamification's internal endpoint.
        Returns None when gamification is unreachable (callers fail closed —
        a stake battle must never admit a player whose XP can't be proven)."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/xp/{user_id}",
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
                if r.status_code == 200:
                    return int(r.json().get("total_xp", 0))
        except Exception as exc:
            logger.warning("XP lookup failed for %s: %s", user_id, exc)
        return None

    async def notify_challenge_task_progress(self, user_id: uuid.UUID, battle_id: uuid.UUID) -> None:
        """Best-effort, fire-and-forget POST to gamification_service so any
        Challenge Program task referencing this battle_id re-checks itself
        server-side. A no-op if the user isn't enrolled in any challenge
        referencing this battle."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/challenge-programs/internal/task-progress",
                    json={"user_id": str(user_id), "task_content_ref": str(battle_id), "task_type": "battle"},
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception as exc:
            logger.warning("Failed to notify challenge task progress: %s", exc)

    async def record_activity(self, user_id: uuid.UUID, subject: str | None, xp_earned: int) -> None:
        """Best-effort, fire-and-forget POST to gamification_service so a battle
        win can appear in the winner's friends' Friend Activity feed."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/activity/record",
                    json={
                        "user_id": str(user_id),
                        "activity_type": "battle_won",
                        "title": f"{subject} Battle" if subject else "Battle",
                        "subject": subject,
                        "xp_earned": xp_earned,
                    },
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
        except Exception as exc:
            logger.warning("Failed to record activity feed event: %s", exc)
