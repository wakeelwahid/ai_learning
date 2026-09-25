"""Subscription lookup for end users, plus the internal subscription-status
endpoint other services call over HTTP.

ROUTE ORDER IS LOAD-BEARING: `/subscription/{user_id}` is registered before
`/subscription/status/{user_id}`, exactly as in the original single routes
file. FastAPI only falls through to the more specific route because the
literal segment "status" fails `{user_id}`'s UUID coercion. Keep both in this
module, in this order, so the behavior can never drift.
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id
from app.crud import subscription_crud
from app.database.session import get_db
from app.models.enums import PaymentStatus, SubscriptionStatus
from app.models.payment_record import Payment
from app.models.subscription import Subscription
from app.routes._common import require_internal
from app.schemas.subscription import GrantSubscriptionRequest, GrantSubscriptionResponse, SubscriptionResponse
from app.services.family_entitlement_service import get_inherited_subscription

router = APIRouter(prefix="/payments", tags=["payments"])


# ── Subscription lookup ────────────────────────────────────────────────────────

@router.post("/subscription/{user_id}/cancel", response_model=SubscriptionResponse)
async def cancel_subscription(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Self-service cancel: matches the "Cancel anytime... access continues
    until the end of the billing period" promise made on SubscriptionPage —
    there is no recurring billing in this system (every purchase is a
    one-time Cashfree order), so cancelling doesn't stop a future charge; it
    only records intent so the student isn't left wondering whether their
    click did anything. Sets `deactivated_at` WITHOUT touching status or
    expires_at, so get_active_subscription (which only checks status==ACTIVE
    and expires_at > now) keeps returning this subscription as active for
    the remainder of the paid period, exactly as promised."""
    if current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied: you can only cancel your own subscription.")
    sub = await subscription_crud.get_active_subscription(db, user_id)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription to cancel")
    if sub.deactivated_at:
        return SubscriptionResponse.model_validate(sub)
    await db.execute(
        update(Subscription)
        .where(Subscription.id == sub.id)
        .values(deactivated_at=datetime.now(timezone.utc))
    )
    await db.refresh(sub)
    return SubscriptionResponse.model_validate(sub)


@router.get("/subscription/{user_id}", response_model=SubscriptionResponse | None)
async def get_active_subscription(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    if current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied: you can only view your own subscription.")
    return await subscription_crud.get_active_subscription(db, user_id)


@router.get("/subscription/{user_id}/effective")
async def get_effective_subscription(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> dict:
    """Like GET /subscription/{user_id}, but also reports family-inherited
    premium (see get_subscription_status's docstring) — the SubscriptionPage
    UI uses this instead of the plain lookup so a student whose parent pays
    doesn't see "no subscription" while every premium-gated quota actually
    treats them as premium."""
    if current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied: you can only view your own subscription.")

    sub = await subscription_crud.get_active_subscription(db, user_id)
    if sub:
        return {"has_own_subscription": True, "inherited_from_parent": None, "subscription": SubscriptionResponse.model_validate(sub)}

    parent_id, parent_sub = await get_inherited_subscription(db, user_id)
    if parent_sub:
        return {
            "has_own_subscription": False,
            "inherited_from_parent": str(parent_id),
            "expires_at": parent_sub.expires_at.isoformat() if parent_sub.expires_at else None,
            "subscription": None,
        }

    return {"has_own_subscription": False, "inherited_from_parent": None, "subscription": None}


# ── Internal subscription status check ───────────────────────────────────────
# Phase 11: Restricted to Docker-internal network IPs only.
# The gateway and other microservices call this on edtech_net (172.x.x.x).
# Requests from external IPs (not RFC-1918) are rejected with 404.

@router.get(
    "/subscription/status/{user_id}",
    summary="[Internal] Get subscription plan tier for a user",
    include_in_schema=False,   # hidden from public Swagger docs
)
async def get_subscription_status(
    user_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),   # Phase 11: internal-only guard
):
    """Returns the active plan tier or 'free' if none.

    Family entitlement sharing: a student with no subscription of their own
    inherits "premium" if ANY parent with a student-approved link
    (verified via user_service, never assumed) has their own active
    subscription. This is read-only inheritance — the student never gets
    their own Subscription row, no plan_id/expires_at of their own to
    report, so the response marks this case explicitly with
    inherited_from_parent rather than fabricating fields that would make it
    look like the student has their own paid plan."""
    sub = await subscription_crud.get_active_subscription_for_status(db, user_id)
    if sub:
        # All active plans unlock every feature — return "premium" so all
        # require_*_plan guards pass, regardless of which specific tier it is.
        return {
            "user_id": str(user_id),
            "plan": "premium",
            "is_active": True,
            "plan_id": sub.plan,
            "starts_at":  sub.starts_at.isoformat()  if sub.starts_at  else None,
            "expires_at": sub.expires_at.isoformat()  if sub.expires_at else None,
            "deactivated_at": sub.deactivated_at.isoformat() if getattr(sub, "deactivated_at", None) else None,
        }

    parent_id, parent_sub = await get_inherited_subscription(db, user_id)
    if parent_sub:
        return {
            "user_id": str(user_id),
            "plan": "premium",
            "is_active": True,
            "plan_id": parent_sub.plan,
            "starts_at": None,
            "expires_at": parent_sub.expires_at.isoformat() if parent_sub.expires_at else None,
            "deactivated_at": None,
            "inherited_from_parent": str(parent_id),
        }

    return {"user_id": str(user_id), "plan": "free", "is_active": False}


# ── Internal: grant free premium days (no payment) ─────────────────────────────
# Used by referral_service to pay out "N days premium" milestone rewards
# without a real Cashfree order. Idempotent on `grant_reference` — a retry of
# the same reference (e.g. the same ReferralReward id) must not grant twice.

@router.post(
    "/subscription/internal/grant",
    response_model=GrantSubscriptionResponse,
    summary="[Internal] Grant N days of premium access with no payment involved",
    include_in_schema=False,
    dependencies=[Depends(require_internal)],
)
async def grant_subscription_days(
    body: GrantSubscriptionRequest,
    db: AsyncSession = Depends(get_db),
):
    grant_key = f"grant_{body.grant_reference}"
    existing = await db.execute(
        select(Payment).where(Payment.cashfree_order_id == grant_key)
    )
    if existing.scalar_one_or_none():
        # Already granted for this exact reference — return current state,
        # do not extend again.
        sub = await subscription_crud.get_active_subscription(db, body.user_id)
        return GrantSubscriptionResponse(
            granted=False,
            already_granted=True,
            expires_at=sub.expires_at if sub else None,
        )

    now = datetime.now(timezone.utc)
    existing_sub_result = await db.execute(
        select(Subscription)
        .where(
            Subscription.user_id == body.user_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.expires_at > now,
        )
        .order_by(Subscription.expires_at.desc())
        .limit(1)
    )
    active_sub = existing_sub_result.scalar_one_or_none()

    if active_sub:
        new_expires = active_sub.expires_at + timedelta(days=body.days)
        await db.execute(
            update(Subscription)
            .where(Subscription.id == active_sub.id)
            .values(expires_at=new_expires)
        )
    else:
        new_expires = now + timedelta(days=body.days)
        active_sub = Subscription(
            user_id=body.user_id,
            plan=body.plan_key,
            status=SubscriptionStatus.ACTIVE,
            starts_at=now,
            expires_at=new_expires,
        )
        db.add(active_sub)
        await db.flush()

    # A zero-amount, no-gateway Payment row is the idempotency marker for
    # this grant — not a real charge. gateway="referral_grant" makes it
    # unambiguous in any revenue/audit query that this was never real money.
    db.add(Payment(
        user_id=body.user_id,
        plan_key=body.plan_key,
        amount_paise=0,
        currency="INR",
        status=PaymentStatus.CAPTURED,
        gateway="referral_grant",
        cashfree_order_id=grant_key,
        subscription_id=active_sub.id,
    ))
    await db.flush()

    return GrantSubscriptionResponse(granted=True, already_granted=False, expires_at=new_expires)
