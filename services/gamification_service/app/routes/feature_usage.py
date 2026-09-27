import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin, require_internal, verify_owner_or_admin
from app.database.session import get_db
from app.services.gamification_service import FeatureLimitService, FeatureUsageService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Feature Usage Limits (admin-configurable, cross-service) ──────────────────
# Single source of truth for every per-feature daily quota on the platform —
# see app/models/gamification.py's FEATURE_KEYS docstring for the full list
# and app/services/gamification_service.py's FeatureUsageService for the
# enforcement logic every gated service calls.

class FeatureLimitUpdateRequest(BaseModel):
    free_daily_limit: int | None = Field(default=None, ge=0)
    premium_daily_limit: int | None = Field(default=None, ge=0)
    is_active: bool = True


class UsageCheckRequest(BaseModel):
    user_id: uuid.UUID
    feature_key: str


@router.get("/admin/feature-limits", dependencies=[Depends(require_admin)])
async def get_feature_limits(db: AsyncSession = Depends(get_db)):
    """[Admin] Every feature's current daily limit (free/premium) + active
    flag. Every value here takes effect immediately, no deploy required."""
    rows = await FeatureLimitService(db).get_all()
    return [
        {
            "feature_key": r.feature_key,
            "free_daily_limit": r.free_daily_limit,
            "premium_daily_limit": r.premium_daily_limit,
            "is_active": r.is_active,
        }
        for r in rows
    ]


@router.patch("/admin/feature-limits/{feature_key}", dependencies=[Depends(require_admin)])
async def set_feature_limit(feature_key: str, body: FeatureLimitUpdateRequest, db: AsyncSession = Depends(get_db)):
    """[Admin] Set one feature's daily limits."""
    row = await FeatureLimitService(db).set(feature_key, body.free_daily_limit, body.premium_daily_limit, body.is_active)
    await db.commit()
    return {
        "feature_key": row.feature_key,
        "free_daily_limit": row.free_daily_limit,
        "premium_daily_limit": row.premium_daily_limit,
        "is_active": row.is_active,
    }


@router.get("/usage/status/{user_id}", dependencies=[Depends(verify_owner_or_admin)])
async def get_usage_status(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Today's usage/limit for every feature — powers the "Usage Today"
    widget. Read-only, never increments anything."""
    return await FeatureUsageService(db).get_status(user_id)


@router.post("/internal/usage/check-and-log", dependencies=[Depends(require_internal)])
async def internal_check_and_log(body: UsageCheckRequest, db: AsyncSession = Depends(get_db)):
    """[Internal] Called by every gated service (ai_service, content_service,
    quiz_service, battle_service, user_service) right before it performs a
    quota-limited action. Raises 429 with an upgrade-prompt message if the
    caller's plan-tier limit for this feature is already reached today."""
    result = await FeatureUsageService(db).check_and_log(body.user_id, body.feature_key)
    await db.commit()
    return result
