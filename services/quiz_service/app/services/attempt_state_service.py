"""
Quiz-in-progress pause/resume state — Redis-only, no DB, no side effects.
Kept separate from AttemptService because it never touches PostgreSQL and
has nothing to do with scoring or finalization.
"""
from app.core.cache import cache_get, cache_set


class AttemptStateService:
    async def save_attempt_state(self, attempt_id: str, user_id: str, state: dict) -> bool:
        """
        Persist quiz-in-progress state to Redis.

        Key  : quiz:attempt:state:{user_id}:{attempt_id}
        TTL  : 86400 s (24 h)
        State: {answers: {}, current_q: int, marked_for_review: [], time_per_q: {}}
        Returns True on success.
        """
        key = f"quiz:attempt:state:{user_id}:{attempt_id}"
        await cache_set(key, state, 86400)
        return True

    async def get_attempt_state(self, attempt_id: str, user_id: str) -> dict | None:
        """
        Retrieve quiz-in-progress state from Redis.
        Returns None if no saved state exists.
        """
        key = f"quiz:attempt:state:{user_id}:{attempt_id}"
        return await cache_get(key)
