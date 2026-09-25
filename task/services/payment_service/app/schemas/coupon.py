import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.limits import COUPON_CODE_MAX_LEN, PLAN_KEY_MAX_LEN


class CouponValidateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=COUPON_CODE_MAX_LEN)
    plan: str = Field(min_length=1, max_length=PLAN_KEY_MAX_LEN)
    user_id: uuid.UUID | None = None


class CouponValidateResponse(BaseModel):
    valid: bool
    discount_amount: int = 0      # paise
    final_price: int = 0          # paise
    original_price: int = 0       # paise
    message: str


class CouponCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=COUPON_CODE_MAX_LEN)
    discount_type: Literal["percent", "flat"]
    # Bounded so a coupon can never be created that fully wipes out (or
    # exceeds) a plan's price: percent discounts are capped at 100 by the
    # validator below; flat discounts (paise) are capped well above any
    # realistic plan price so a typo can't create an effectively-unlimited
    # discount.
    discount_value: int = Field(gt=0, le=1_000_000)
    applicable_plans: list[str] = []
    max_uses: int = Field(default=0, ge=0, le=1_000_000)
    expires_at: datetime | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def _validate_percent_bounds(self) -> "CouponCreateRequest":
        if self.discount_type == "percent" and self.discount_value > 100:
            raise ValueError("Percent discount cannot exceed 100.")
        return self


class CouponToggleRequest(BaseModel):
    is_active: bool


class CouponResponse(BaseModel):
    id: uuid.UUID
    code: str
    discount_type: str
    discount_value: int
    applicable_plans: list
    max_uses: int
    used_count: int
    expires_at: datetime | None
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}
