import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, is_admin_role, verify_owner_or_admin
from app.crud.gamification_crud import get_user_streak
from app.database.session import get_db
from app.routes._common import peek_role
from app.schemas.gamification import RecordActivityRequest
from app.services.gamification_service import GamificationService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Streak endpoint ───────────────────────────────────────────────────────────

@router.post("/streak/record")
async def record_activity(
    body: RecordActivityRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(peek_role),
):
    """Record daily activity for streak calculation — committed before the
    response is sent (previously BackgroundTasks, which runs after the
    response with no persistence; a crash/restart in that window silently
    lost the streak update, which gates 7/30-day badges and freeze
    consumption — same fix as xp_level.py::award_xp. Callers already
    discard the response body, so this only changes when the write happens,
    not what any caller observes).

    Phase 11: Only admins or the authenticated user themselves may record
    activity for streak purposes. Prevents IDOR where a user could forge
    body.user_id to manipulate another user's streak.
    """
    if current_user_id != body.user_id and not is_admin_role(_role):
        raise HTTPException(status_code=403, detail="Cannot record activity for another user.")
    result = await GamificationService(db).update_streak(body.user_id)
    await db.commit()
    return result


@router.get("/streak/{user_id}", dependencies=[Depends(verify_owner_or_admin)])
async def get_streak(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return current and longest streak for a user."""
    streak_row = await get_user_streak(db, user_id)
    return {
        "user_id": str(user_id),
        "current": streak_row.current_streak if streak_row else 0,
        "longest": streak_row.longest_streak if streak_row else 0,
        "last_activity": streak_row.last_activity_date.isoformat() if streak_row and streak_row.last_activity_date else None,
    }


# ── Streaks alias endpoint ────────────────────────────────────────────────────

@router.get("/streaks/{user_id}", dependencies=[Depends(verify_owner_or_admin)])
async def get_streaks(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Alias for /streak/{user_id} — returns current and longest streak for a user."""
    streak_row = await get_user_streak(db, user_id)
    return {
        "user_id": str(user_id),
        "current": streak_row.current_streak if streak_row else 0,
        "longest": streak_row.longest_streak if streak_row else 0,
        "last_activity": streak_row.last_activity_date.isoformat() if streak_row and streak_row.last_activity_date else None,
    }
