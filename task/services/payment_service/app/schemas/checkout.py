import uuid

from pydantic import BaseModel, Field

from app.schemas.limits import CF_ID_MAX_LEN, COUPON_CODE_MAX_LEN, PLAN_KEY_MAX_LEN


class CreateOrderRequest(BaseModel):
    user_id: uuid.UUID
    plan: str = Field(min_length=1, max_length=PLAN_KEY_MAX_LEN)
    coupon_code: str | None = Field(default=None, min_length=1, max_length=COUPON_CODE_MAX_LEN)


class CreateOrderResponse(BaseModel):
    order_id: str
    payment_session_id: str
    amount: int
    currency: str
    key: str  # "test_mode" | "sandbox" | "production" — tells the client which Cashfree checkout mode to use
    payment_id: str
    discount_amount: int = 0
    original_amount: int = 0


class VerifyPaymentRequest(BaseModel):
    order_id: str = Field(min_length=1, max_length=CF_ID_MAX_LEN)
    user_id: uuid.UUID
    plan: str = Field(min_length=1, max_length=PLAN_KEY_MAX_LEN)
    coupon_code: str | None = Field(default=None, min_length=1, max_length=COUPON_CODE_MAX_LEN)


class RetryPaymentRequest(BaseModel):
    payment_id: uuid.UUID
    user_id: uuid.UUID


class RefundPaymentRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class RefundPaymentResponse(BaseModel):
    payment_id: uuid.UUID
    refund_id: str
    status: str
    subscription_cancelled: bool
