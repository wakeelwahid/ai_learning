import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select

from app.models.enums import SubscriptionStatus
from app.models.plan import Plan
from app.models.subscription import Subscription


async def get_active_subscription(db, user_id: uuid.UUID):
    result = await db.execute(
        select(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.expires_at > datetime.now(timezone.utc),
        )
        .order_by(Subscription.expires_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()

async def list_subscriptions(db, status=None, plan=None, page=1, limit=50):
    q = select(Subscription)
    if status:
        try: q = q.where(Subscription.status == SubscriptionStatus(status))
        except ValueError: pass
    if plan:
        q = q.where(Subscription.plan == plan)
    q = q.order_by(Subscription.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()

async def get_subscription_stats(db) -> dict:
    """Per-plan active counts + estimated MRR, computed dynamically against
    whatever plans currently exist in the `plans` table (admin-managed) —
    no hardcoded plan keys or prices."""
    total_active = await db.scalar(
        select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.ACTIVE)
    )

    plan_rows = (await db.execute(select(Plan))).scalars().all()
    active_counts_by_plan = dict(
        (await db.execute(
            select(Subscription.plan, func.count(Subscription.id))
            .where(Subscription.status == SubscriptionStatus.ACTIVE)
            .group_by(Subscription.plan)
        )).all()
    )
    per_plan_counts: dict[str, int] = {}
    monthly_revenue_paise = 0
    for p in plan_rows:
        count = active_counts_by_plan.get(p.plan_key, 0)
        per_plan_counts[p.plan_key] = count
        # Normalize each plan's price to a monthly-equivalent for MRR estimation
        monthly_equivalent = p.price_paise * 30 // max(p.duration_days, 1)
        monthly_revenue_paise += count * monthly_equivalent

    return {
        "total_active": total_active or 0,
        "per_plan": per_plan_counts,
        "monthly_revenue_paise": monthly_revenue_paise,
    }


# ── Subscription status (internal) ──────────────────────────────────────────

async def get_active_subscription_for_status(db, user_id: uuid.UUID):
    """Same active-subscription lookup as get_active_subscription, kept as a
    separate function because it backs the internal /subscription/status/{id}
    endpoint (imports its own local Subscription/SubscriptionStatus names in
    the original route) — preserved verbatim rather than merged, to avoid any
    behavioral drift between the two call sites."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.expires_at > now,
        )
        .order_by(Subscription.expires_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_active_subscriptions_for_users(db, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, Subscription]:
    """Batched form of get_active_subscription_for_status for a list of
    users (e.g. all approved parents of one student) — one query instead of
    one per user. Where a user has more than one active row, keeps the
    latest-expiring one, matching the single-user function's ordering."""
    if not user_ids:
        return {}
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Subscription)
        .where(
            Subscription.user_id.in_(user_ids),
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.expires_at > now,
        )
        .order_by(Subscription.expires_at.desc())
    )
    by_user: dict[uuid.UUID, Subscription] = {}
    for sub in result.scalars().all():
        by_user.setdefault(sub.user_id, sub)  # first seen per user = latest-expiring, due to ORDER BY
    return by_user
