import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, verify_owner_or_admin
from app.database.session import get_db
from app.services.gamification_service import StreakFreezeService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Streak Freeze endpoints ───────────────────────────────────────────────────

@router.post("/streaks/freeze/purchase", dependencies=[Depends(get_current_user_id)])
async def purchase_streak_freeze(
    user_id: uuid.UUID = Query(..., description="User purchasing the freeze"),
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Spend 50 EduPoints to bank one Streak Freeze (max 3 banked at once).
    Auto-applied the next day a streak would otherwise break."""
    if current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot purchase freeze for another user.")
    result = await StreakFreezeService(db).purchase(user_id)
    await db.commit()
    return result


@router.get("/streaks/freeze/status/{user_id}", dependencies=[Depends(verify_owner_or_admin)])
async def get_streak_freeze_status(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return current freeze bank, cost, eligibility and EP balance."""
    return await StreakFreezeService(db).status(user_id)
