import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id
from app.crud.reward_crud import get_user_rewards
from app.database.session import get_db
from app.routes.guards import ensure_self
from app.schemas.responses import ReferralCodeResponse
from app.services.code_service import ReferralCodeService

router = APIRouter(prefix="/referrals", tags=["referrals"])


@router.get("/code/{user_id}", response_model=ReferralCodeResponse)
async def get_referral_code(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    ensure_self(user_id, caller_id)
    service = ReferralCodeService(db)
    code = await service.get_or_create_code(user_id)
    return ReferralCodeResponse(
        code=code.code,
        total_referrals=code.total_referrals,
        qualified_referrals=code.qualified_referrals,
    )


@router.get("/stats/{user_id}")
async def get_referral_stats(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    """Full referral stats: code, counts, rewards earned."""
    ensure_self(user_id, caller_id)
    service = ReferralCodeService(db)
    code = await service.get_or_create_code(user_id)
    rewards = await get_user_rewards(db, user_id)
    return {
        "user_id": str(user_id),
        "code": code.code,
        "total_referrals": code.total_referrals,
        "qualified_referrals": code.qualified_referrals,
        "rewards": [r.model_dump() if hasattr(r, "model_dump") else r for r in rewards],
    }
