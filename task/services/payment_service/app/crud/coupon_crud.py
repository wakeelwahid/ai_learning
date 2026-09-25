import uuid

from sqlalchemy import select, update

from app.models.coupon import Coupon


async def get_coupon_by_code(db, code: str):
    result = await db.execute(select(Coupon).where(Coupon.code == code.upper()))
    return result.scalar_one_or_none()


async def create_coupon(db, body, is_active: bool | None = None) -> Coupon:
    kwargs = dict(
        code=body.code.upper(),
        discount_type=body.discount_type,
        discount_value=body.discount_value,
        applicable_plans=body.applicable_plans,
        max_uses=body.max_uses,
        expires_at=body.expires_at,
    )
    if is_active is not None:
        kwargs["is_active"] = is_active
    coupon = Coupon(**kwargs)
    db.add(coupon)
    await db.flush()
    await db.refresh(coupon)
    await db.commit()
    return coupon


async def list_coupons(db, active_only: bool = False, page: int = 1, limit: int = 50):
    q = select(Coupon)
    if active_only:
        q = q.where(Coupon.is_active == True)  # noqa: E712
    q = q.order_by(Coupon.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


async def get_coupon_by_id(db, coupon_id: uuid.UUID):
    result = await db.execute(select(Coupon).where(Coupon.id == coupon_id))
    return result.scalar_one_or_none()


async def deactivate_coupon(db, coupon_id: uuid.UUID) -> None:
    await db.execute(update(Coupon).where(Coupon.id == coupon_id).values(is_active=False))
    await db.commit()


async def list_coupons_admin(db, page: int = 1, limit: int = 100, include_inactive: bool = False):
    q = select(Coupon)
    if not include_inactive:
        q = q.where(Coupon.is_active == True)  # noqa: E712
    q = q.order_by(Coupon.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


async def toggle_coupon(db, coupon: Coupon, is_active: bool) -> Coupon:
    await db.execute(update(Coupon).where(Coupon.id == coupon.id).values(is_active=is_active))
    await db.commit()
    await db.refresh(coupon)
    return coupon
