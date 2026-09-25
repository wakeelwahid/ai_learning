import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import SubscriptionStatus
from app.schemas.limits import PLAN_KEY_MAX_LEN


class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    plan: str
    status: SubscriptionStatus
    starts_at:      datetime | None
    expires_at:     datetime | None
    deactivated_at: datetime | None = None
    carry_over_days: int = 0   # days rolled over from a previous unexpired plan
    model_config = {"from_attributes": True}


class GrantSubscriptionRequest(BaseModel):
    user_id: uuid.UUID
    days: int = Field(gt=0, le=365)
    plan_key: str = Field(min_length=1, max_length=PLAN_KEY_MAX_LEN)
    # Caller-supplied idempotency key — e.g. the referral_service
    # ReferralReward.id — so retrying the same grant never double-extends.
    grant_reference: str = Field(min_length=1, max_length=100)


class GrantSubscriptionResponse(BaseModel):
    granted: bool
    already_granted: bool
    expires_at: datetime | None
