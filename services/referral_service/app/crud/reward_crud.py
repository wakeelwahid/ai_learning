import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reward import ReferralReward
from app.schemas.responses import ReferralRewardResponse


async def get_user_rewards(db: AsyncSession, user_id: uuid.UUID) -> list[ReferralRewardResponse]:
    result = await db.execute(
        select(ReferralReward).where(ReferralReward.user_id == user_id)
    )
    rewards = result.scalars().all()
    return [
        ReferralRewardResponse(
            milestone=r.milestone,
            reward_type=r.reward_type,
            is_claimed=r.is_claimed,
            awarded_at=r.awarded_at,
        )
        for r in rewards
    ]
