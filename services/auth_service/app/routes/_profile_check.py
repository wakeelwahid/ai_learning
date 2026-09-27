"""Shared user_service profile helpers.

`check_profile_complete` is called from both the phone-OTP verify route and
the /profile-status route.
"""
import uuid

import httpx

from app.core.config import settings
from app.models.user import UserRole


async def check_profile_complete(user_id: uuid.UUID, role: UserRole) -> bool:
    """Real backend check, not a frontend flag: calls user_service's internal
    profile endpoint. Students need full_name+board+class_number; parents/
    teachers/admins only need full_name (board/class don't apply to them)."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/profile/{user_id}",
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code != 200:
            return False
        p = resp.json()
        if not p.get("exists") or not p.get("full_name"):
            return False
        if role == UserRole.STUDENT:
            return bool(p.get("board")) and p.get("class_number") is not None
        return True
    except Exception:
        return False
