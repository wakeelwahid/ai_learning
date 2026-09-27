import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, is_admin_role, require_admin, verify_owner_or_admin
from app.crud.gamification_crud import commit_reward_calendar, update_reward_calendar_day as crud_update_reward_calendar_day
from app.database.session import get_db
from app.routes._common import peek_role
from app.schemas.gamification import DailyRewardClaimResponse, DailyRewardStatusResponse, RewardCalendarDayUpdate
from app.services.gamification_service import DailyRewardService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Daily Rewards (Day 1-7 check-in calendar) ─────────────────────────────────

@router.get("/daily-reward/status/{user_id}", response_model=DailyRewardStatusResponse, dependencies=[Depends(verify_owner_or_admin)])
async def get_daily_reward_status(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await DailyRewardService(db).status(user_id)


@router.post("/daily-reward/claim/{user_id}", response_model=DailyRewardClaimResponse)
async def claim_daily_reward(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(peek_role),
):
    """Claim today's check-in reward. Only the user themselves (or an admin)
    may claim — prevents forging another user's daily-reward streak."""
    if current_user_id != user_id and not is_admin_role(_role):
        raise HTTPException(status_code=403, detail="Cannot claim another user's daily reward.")
    result = await DailyRewardService(db).claim(user_id)
    await db.commit()
    return result


@router.get("/admin/reward-calendar", dependencies=[Depends(require_admin)])
async def list_reward_calendar(db: AsyncSession = Depends(get_db)):
    """[Admin] The full Day 1-7 reward calendar — editable with no code deploy."""
    calendar = await DailyRewardService(db)._calendar()
    await commit_reward_calendar(db)
    return [
        {"day": d, "xp": r.xp, "ep": r.ep, "label": r.label}
        for d, r in sorted(calendar.items())
    ]


@router.patch("/admin/reward-calendar/{day}", dependencies=[Depends(require_admin)])
async def update_reward_calendar_day(
    day: int,
    body: RewardCalendarDayUpdate,
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Edit one Day 1-7 reward slot."""
    if not 1 <= day <= 7:
        raise HTTPException(status_code=400, detail="day must be between 1 and 7")
    calendar = await DailyRewardService(db)._calendar()
    row = calendar[day]
    row = await crud_update_reward_calendar_day(db, row, body.xp, body.ep, body.label)
    return {"day": day, "xp": row.xp, "ep": row.ep, "label": row.label}
