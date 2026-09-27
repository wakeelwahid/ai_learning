from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.models.enums import PaymentStatus, SubscriptionStatus
from app.models.payment_record import Payment
from app.models.subscription import Subscription


async def get_revenue_stats(db) -> dict:
    """Real revenue/subscription-churn metrics computed directly from actual
    payment transactions and subscription rows — no projections, no
    hardcoded values. Distinct from get_subscription_stats' `monthly_revenue_paise`
    (an MRR *estimate* from current active-sub prices); this returns what
    was genuinely captured."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_revenue_paise = await db.scalar(
        select(func.coalesce(func.sum(Payment.amount_paise), 0))
        .where(Payment.status == PaymentStatus.CAPTURED)
    )
    today_revenue_paise = await db.scalar(
        select(func.coalesce(func.sum(Payment.amount_paise), 0))
        .where(Payment.status == PaymentStatus.CAPTURED, Payment.created_at >= today_start)
    )
    new_subscriptions_today = await db.scalar(
        select(func.count(Subscription.id)).where(Subscription.created_at >= today_start)
    )
    cancellations_today = await db.scalar(
        select(func.count(Subscription.id)).where(
            Subscription.status == SubscriptionStatus.CANCELLED,
            Subscription.deactivated_at >= today_start,
        )
    )
    total_successful_payments = await db.scalar(
        select(func.count(Payment.id)).where(Payment.status == PaymentStatus.CAPTURED)
    )
    total_failed_payments = await db.scalar(
        select(func.count(Payment.id)).where(Payment.status == PaymentStatus.FAILED)
    )
    total_refunds = await db.scalar(
        select(func.count(Payment.id)).where(Payment.status == PaymentStatus.REFUNDED)
    )

    return {
        "total_revenue_paise": total_revenue_paise or 0,
        "today_revenue_paise": today_revenue_paise or 0,
        "new_subscriptions_today": new_subscriptions_today or 0,
        "cancellations_today": cancellations_today or 0,
        "successful_payments": total_successful_payments or 0,
        "failed_payments": total_failed_payments or 0,
        "refunds": total_refunds or 0,
    }


async def get_daily_revenue(db, days: int) -> list[dict]:
    """Daily captured-revenue totals for the last N days — real per-day sums,
    zero-filled for days with no captured payments (never omitted/estimated)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    rows = (await db.execute(
        select(
            func.date(Payment.created_at).label("day"),
            func.sum(Payment.amount_paise).label("revenue_paise"),
        )
        .where(Payment.status == PaymentStatus.CAPTURED, Payment.created_at >= cutoff)
        .group_by(func.date(Payment.created_at))
        .order_by(func.date(Payment.created_at))
    )).all()
    by_day = {str(r.day): int(r.revenue_paise) for r in rows}

    result = []
    for i in range(days):
        d = (cutoff + timedelta(days=i)).date()
        result.append({"date": str(d), "revenue_paise": by_day.get(str(d), 0)})
    return result
