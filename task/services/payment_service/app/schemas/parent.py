import uuid

from pydantic import BaseModel, Field

from app.schemas.limits import CF_ID_MAX_LEN, COUPON_CODE_MAX_LEN, PLAN_KEY_MAX_LEN


class ParentCreateOrderRequest(BaseModel):
    student_id: uuid.UUID
    plan: str = Field(min_length=1, max_length=PLAN_KEY_MAX_LEN)
    coupon_code: str | None = Field(default=None, min_length=1, max_length=COUPON_CODE_MAX_LEN)


class ParentVerifyPaymentRequest(BaseModel):
    order_id: str = Field(min_length=1, max_length=CF_ID_MAX_LEN)
    student_id: uuid.UUID
    plan: str = Field(min_length=1, max_length=PLAN_KEY_MAX_LEN)
    coupon_code: str | None = Field(default=None, min_length=1, max_length=COUPON_CODE_MAX_LEN)


class StudentSubscriptionStatus(BaseModel):
    student_id: str
    plan: str
    status: str
    is_active: bool
    expires_at: str | None
    days_until_expiry: int | None
    expiry_warning: bool
