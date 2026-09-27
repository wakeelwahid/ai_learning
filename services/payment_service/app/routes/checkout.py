"""Order creation, payment verification, retry and receipt download."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, get_current_user_id_and_role
from app.database.session import get_db
from app.schemas.checkout import (
    CreateOrderRequest,
    CreateOrderResponse,
    RetryPaymentRequest,
    VerifyPaymentRequest,
)
from app.schemas.receipt import ReceiptResponse
from app.schemas.subscription import SubscriptionResponse
from app.services.cashfree_service import CashfreeService
from app.routes._common import consume_purchase_approval, require_purchase_approval

router = APIRouter(prefix="/payments", tags=["payments"])


# ── Orders ─────────────────────────────────────────────────────────────────────

@router.post("/orders", response_model=CreateOrderResponse)
async def create_order(
    body: CreateOrderRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    if body.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied: you can only create orders for yourself.")
    await require_purchase_approval(current_user_id, body.plan)
    service = CashfreeService(db)
    result = await service.create_order(str(body.user_id), body.plan, coupon_code=body.coupon_code)
    await db.commit()
    return result


@router.post("/verify", response_model=SubscriptionResponse)
async def verify_payment(
    body: VerifyPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    if body.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied: you can only verify payments for yourself.")
    service = CashfreeService(db)
    subscription, carry_over_days = await service.verify_and_activate(
        body.order_id,
        body.user_id,
        body.plan,
        coupon_code=body.coupon_code,
    )
    await db.commit()
    await consume_purchase_approval(current_user_id, body.plan)
    return SubscriptionResponse(
        id=subscription.id,
        user_id=subscription.user_id,
        plan=subscription.plan,
        status=subscription.status,
        starts_at=subscription.starts_at,
        expires_at=subscription.expires_at,
        carry_over_days=carry_over_days,
    )


# ── Retry ──────────────────────────────────────────────────────────────────────

@router.post("/retry", response_model=CreateOrderResponse, summary="Retry a failed payment")
async def retry_payment(
    body: RetryPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    if body.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied: you can only retry your own payments.")
    service = CashfreeService(db)
    result = await service.retry_payment(body.payment_id, current_user_id)
    await db.commit()
    return result


# ── Receipt ────────────────────────────────────────────────────────────────────

@router.get("/{payment_id}/receipt", response_model=ReceiptResponse,
            summary="Download invoice/receipt for a payment")
async def get_receipt(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    caller: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
):
    current_user_id, role = caller
    service = CashfreeService(db)
    return await service.generate_receipt(payment_id, current_user_id, role)
