import uuid

from sqlalchemy import func, select

from app.models.enums import PaymentStatus
from app.models.payment_record import Payment


async def list_payments(
    db, status: str | None = None, user_id: uuid.UUID | None = None, page: int = 1, limit: int = 50
) -> tuple[list[Payment], int]:
    q = select(Payment)
    count_q = select(func.count(Payment.id))
    if status:
        try:
            parsed = PaymentStatus(status)
            q = q.where(Payment.status == parsed)
            count_q = count_q.where(Payment.status == parsed)
        except ValueError:
            pass
    if user_id:
        q = q.where(Payment.user_id == user_id)
        count_q = count_q.where(Payment.user_id == user_id)
    total = await db.scalar(count_q)
    q = q.order_by(Payment.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all()), int(total or 0)


async def get_payment_by_id(db, payment_id: uuid.UUID) -> Payment | None:
    return await db.get(Payment, payment_id)
