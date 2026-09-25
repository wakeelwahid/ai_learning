import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import verify_owner_or_admin
from app.crud.gamification_crud import get_user_badges, get_user_streak, get_user_xp
from app.database.session import get_db
from app.schemas.gamification import GamificationProfileResponse
from app.services.gamification_service import EduPointsService, GamificationService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Profile endpoint ──────────────────────────────────────────────────────────

@router.get("/profile/{user_id}", response_model=GamificationProfileResponse, dependencies=[Depends(verify_owner_or_admin)])
async def get_profile(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    # Run queries sequentially — AsyncSession is not concurrency-safe
    xp_row     = await get_user_xp(db, user_id)
    streak_row = await get_user_streak(db, user_id)
    badges     = await get_user_badges(db, user_id)
    ep_balance = await EduPointsService(db).get_balance(user_id)
    level_info = await GamificationService(db).get_level_info(user_id)

    xp_val = xp_row.total_xp if xp_row else 0
    lvl = xp_row.level if xp_row else 1

    return GamificationProfileResponse(
        xp={
            "total_xp": xp_val,
            "level": lvl,
            "xp_to_next_level": level_info["xp_to_next_level"],
            "season_start": xp_row.season_start if xp_row else None,
        },
        streak={
            "current": streak_row.current_streak if streak_row else 0,
            "longest": streak_row.longest_streak if streak_row else 0,
        },
        badges=[{"type": b.badge_type.value, "earned_at": str(b.earned_at)} for b in badges],
        edupoints=ep_balance,
        level_unlocks=level_info["unlocked_features"],
    )
