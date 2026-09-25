"""Parent payment endpoints.

Parents can view and pay for their linked student's subscription. Every route
here first calls `verify_parent_link` (app/routes/_common.py), which fails
CLOSED on any error.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id
from app.crud import subscription_crud
from app.database.session import get_db
from app.models.enums import SubscriptionStatus
from app.routes._common import verify_parent_link
from app.schemas.checkout import CreateOrderResponse
from app.schemas.parent import (
    ParentCreateOrderRequest,
    ParentVerifyPaymentRequest,
    StudentSubscriptionStatus,
)
from app.schemas.subscription import SubscriptionResponse
from app.services.cashfree_service import CashfreeService

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/parent/student-subscription", response_model=StudentSubscriptionStatus)
async def parent_get_student_subscription(
    student_id: uuid.UUID = Query(..., description="Student's user UUID"),
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Return subscription status + expiry info for a student (called by parent)."""
    await verify_parent_link(current_user_id, student_id)

    now = datetime.now(timezone.utc)
    sub = await subscription_crud.get_active_subscription(db, student_id)

    if not sub:
        return StudentSubscriptionStatus(
            student_id=str(student_id),
            plan="free", status="none",
            is_active=False, expires_at=None,
            days_until_expiry=None, expiry_warning=False,
        )

    expires = sub.expires_at
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    days_left: int | None = None
    expiry_warning = False
    if expires:
        days_left = max(0, (expires - now).days)
        expiry_warning = days_left <= 7

    return StudentSubscriptionStatus(
        student_id=str(student_id),
        plan=sub.plan,
        status=sub.status.value if hasattr(sub.status, "value") else str(sub.status),
        is_active=sub.status == SubscriptionStatus.ACTIVE and (expires is None or expires > now),
        expires_at=expires.isoformat() if expires else None,
        days_until_expiry=days_left,
        expiry_warning=expiry_warning,
    )


@router.post("/parent/create-order", response_model=CreateOrderResponse)
async def parent_create_order(
    body: ParentCreateOrderRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Parent initiates a Cashfree order on behalf of a linked student."""
    await verify_parent_link(current_user_id, body.student_id)

    service = CashfreeService(db)
    result = await service.create_order(str(body.student_id), body.plan, coupon_code=body.coupon_code)
    await db.commit()
    return result


@router.post("/parent/verify", response_model=SubscriptionResponse)
async def parent_verify_payment(
    body: ParentVerifyPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Parent verifies a Cashfree payment and activates the subscription for the student."""
    await verify_parent_link(current_user_id, body.student_id)

    service = CashfreeService(db)
    subscription, carry_over_days = await service.verify_and_activate(
        body.order_id,
        body.student_id,
        body.plan,
        coupon_code=body.coupon_code,
    )
    await db.commit()
    return SubscriptionResponse(
        id=subscription.id,
        user_id=subscription.user_id,
        plan=subscription.plan,
        status=subscription.status,
        starts_at=subscription.starts_at,
        expires_at=subscription.expires_at,
        carry_over_days=carry_over_days,
    )
