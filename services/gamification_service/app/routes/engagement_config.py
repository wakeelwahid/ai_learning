from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.database.session import get_db
from app.schemas.gamification import EngagementConfigUpdateRequest
from app.services.gamification_service import EngagementConfigService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Engagement Config ─────────────────────────────────────────────────────────

@router.get("/admin/engagement-config", dependencies=[Depends(require_admin)])
async def get_engagement_config(db: AsyncSession = Depends(get_db)):
    """[Admin] All dynamic engagement toggles (daily_goal_enabled,
    daily_goal_personalized, battle_reminder_lead_minutes, ...) — every
    value here takes effect immediately, no deploy required."""
    return await EngagementConfigService(db).get_all()


@router.patch("/admin/engagement-config/{key}", dependencies=[Depends(require_admin)])
async def set_engagement_config(key: str, body: EngagementConfigUpdateRequest, db: AsyncSession = Depends(get_db)):
    """[Admin] Set one engagement config key."""
    row = await EngagementConfigService(db).set(key, {"value": body.value})
    await db.commit()
    return {"key": row.key, "value": row.value}
