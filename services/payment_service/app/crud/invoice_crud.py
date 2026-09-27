import uuid

from sqlalchemy import select

from app.models.payment_record import Payment
from app.models.subscription import Subscription


async def get_user_invoices_data(db, user_id: uuid.UUID, page: int = 1, limit: int = 50):
    """Return (payments, sub_plan_map) for the given user, newest-payments-first.

    sub_plan_map resolves each payment's linked subscription_id -> plan name
    in a single follow-up query, matching the original route's N+1 avoidance.
    """
    payments_result = await db.execute(
        select(Payment)
        .where(Payment.user_id == user_id)
        .order_by(Payment.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    payments = payments_result.scalars().all()

    sub_ids = {p.subscription_id for p in payments if p.subscription_id is not None}
    sub_plan_map: dict[uuid.UUID, str] = {}
    if sub_ids:
        subs_result = await db.execute(
            select(Subscription).where(Subscription.id.in_(sub_ids))
        )
        for sub in subs_result.scalars().all():
            sub_plan_map[sub.id] = sub.plan

    return payments, sub_plan_map
