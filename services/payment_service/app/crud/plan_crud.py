import uuid

from sqlalchemy import select, update

from app.models.plan import Plan


async def list_all_plans_ordered(db):
    result = await db.execute(select(Plan).order_by(Plan.sort_order, Plan.created_at))
    return result.scalars().all()


async def get_plan_by_key(db, plan_key: str):
    result = await db.execute(select(Plan).where(Plan.plan_key == plan_key))
    return result.scalar_one_or_none()


async def create_plan(db, body) -> Plan:
    plan = Plan(
        plan_key=body.plan_key,
        name=body.name,
        price_paise=body.price * 100,
        currency=body.currency,
        duration_days=body.duration_days,
        badge=body.badge,
        description=body.description,
        features=body.features,
        limits=body.limits,
        is_popular=body.is_popular,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    await db.commit()
    return plan


async def get_plan_by_id(db, plan_id: uuid.UUID):
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    return result.scalar_one_or_none()


async def update_plan(db, plan: Plan, updates: dict) -> Plan:
    for key, value in updates.items():
        setattr(plan, key, value)
    await db.commit()
    await db.refresh(plan)
    return plan


async def deactivate_plan(db, plan_id: uuid.UUID) -> None:
    await db.execute(update(Plan).where(Plan.id == plan_id).values(is_active=False))
    await db.commit()


async def list_active_plans(db):
    result = await db.execute(
        select(Plan).where(Plan.is_active == True).order_by(Plan.sort_order, Plan.created_at)  # noqa: E712
    )
    return result.scalars().all()
