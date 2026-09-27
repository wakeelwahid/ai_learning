from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.models.enums import PaymentStatus, SubscriptionStatus
from app.models.payment_record import Payment
from app.models.plan import Plan
from app.models.subscription import Subscription


async def get_payment_by_order_id(db, order_id: str):
    result = await db.execute(select(Payment).where(Payment.cashfree_order_id == order_id))
    return result.scalar_one_or_none()


async def claim_payment_for_success_webhook(db, payment_id) -> bool:
    """Atomically claim a payment for PAYMENT_SUCCESS_WEBHOOK processing.

    Two deliveries of the same webhook event (Cashfree retries, or a race
    with /verify) can both read payment.status as not-yet-CAPTURED before
    either writes — a plain read-then-write has a TOCTOU gap under concurrent
    delivery. This UPDATE...WHERE is the atomic version of that same check:
    only the caller whose UPDATE actually matches a row (rowcount 1) may
    proceed to process_payment_success_webhook; a second concurrent caller's
    UPDATE matches zero rows and must skip processing.
    """
    result = await db.execute(
        update(Payment)
        .where(Payment.id == payment_id, Payment.status != PaymentStatus.CAPTURED)
        .values(status=PaymentStatus.CAPTURED)
    )
    return result.rowcount > 0


async def process_payment_success_webhook(db, payment: Payment, cf_payment: dict) -> None:
    """Mark a payment CAPTURED and activate a subscription for it if /verify
    hasn't already done so, in one commit.

    Idempotency guard: the route atomically claims the payment via
    `claim_payment_for_success_webhook` (an UPDATE...WHERE status != CAPTURED)
    BEFORE this function is called, so this function only ever runs for a
    payment this call just claimed — a second concurrent delivery's claim
    fails and it never reaches this function. Within this function, the
    sequence stays: (1) record the gateway payment id, (2) check whether the
    user already has an ACTIVE subscription, (3) only if not, and only if a
    plan is found, create the new subscription and link it back to the
    payment, (4) commit once at the end — identical order to the original
    route, minus the now-redundant status write (the claim already set it).
    """
    await db.execute(
        update(Payment)
        .where(Payment.id == payment.id)
        .values(cashfree_payment_id=str(cf_payment.get("cf_payment_id", "")))
    )
    # Activate subscription if /verify hasn't already done so
    sub_result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == payment.user_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
        )
    )
    if not sub_result.scalar_one_or_none() and payment.plan_key:
        plan_result = await db.execute(select(Plan).where(Plan.plan_key == payment.plan_key))
        plan = plan_result.scalar_one_or_none()
        if plan:
            now = datetime.now(timezone.utc)
            sub = Subscription(
                user_id=payment.user_id,
                plan=payment.plan_key,
                status=SubscriptionStatus.ACTIVE,
                starts_at=now,
                expires_at=now + timedelta(days=plan.duration_days),
            )
            db.add(sub)
            await db.flush()
            await db.execute(
                update(Payment).where(Payment.id == payment.id).values(subscription_id=sub.id)
            )
    await db.commit()


async def process_payment_failed_webhook(db, payment: Payment, error_desc: str) -> None:
    await db.execute(
        update(Payment)
        .where(Payment.id == payment.id)
        .values(status=PaymentStatus.FAILED, error_description=error_desc)
    )
    await db.commit()
