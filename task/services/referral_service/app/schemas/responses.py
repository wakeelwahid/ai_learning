from datetime import datetime

from pydantic import BaseModel


class ReferralCodeResponse(BaseModel):
    code: str
    total_referrals: int
    qualified_referrals: int


class ReferralRewardResponse(BaseModel):
    milestone: int
    reward_type: str
    is_claimed: bool
    awarded_at: datetime


class TopReferrerResponse(BaseModel):
    user_id: str
    code: str
    total_referrals: int
    qualified_referrals: int


class AdminOverviewResponse(BaseModel):
    total_referrers: int
    total_referrals: int
    total_qualified: int
    top_referrers: list[TopReferrerResponse]
