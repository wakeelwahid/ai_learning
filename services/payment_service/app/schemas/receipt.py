import uuid
from datetime import datetime

from pydantic import BaseModel


class ReceiptResponse(BaseModel):
    receipt_number: str
    payment_id: uuid.UUID
    cashfree_payment_id: str | None
    cashfree_order_id: str | None
    user_id: uuid.UUID
    plan: str | None
    amount_paise: int
    discount_amount_paise: int
    coupon_code_used: str | None
    currency: str
    status: str
    paid_at: datetime
    model_config = {"from_attributes": True}
