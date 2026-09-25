"""Read-only client for analytics_service's daily-activity rollup.

Study-time enforcement is soft (a banner + blocking NEW videos/quizzes), so
an analytics outage must degrade to "nothing used yet" rather than lock a
student out or 5xx the study-limit screens.
"""
import uuid

import httpx

from app.core.config import settings


async def get_used_today_minutes(user_id: uuid.UUID) -> int:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.ANALYTICS_SERVICE_URL}/api/v1/analytics/internal/activity/{user_id}/today",
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code != 200:
            return 0
        minutes = resp.json().get("study_minutes", 0)
        return max(int(minutes or 0), 0)
    except Exception:  # noqa: BLE001
        return 0


def is_limit_reached(daily_limit_minutes: int | None, is_enabled: bool, used_today_minutes: int) -> bool:
    if not is_enabled or not daily_limit_minutes or daily_limit_minutes <= 0:
        return False
    return used_today_minutes >= daily_limit_minutes
