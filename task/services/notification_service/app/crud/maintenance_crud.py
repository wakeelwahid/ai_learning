"""CRUD helpers for the MaintenanceMode singleton model."""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.maintenance import MaintenanceMode

# Fixed singleton ID — only one maintenance row ever exists
SINGLETON_ID = UUID("00000000-0000-0000-0000-000000000001")


async def get_or_create(db: AsyncSession) -> MaintenanceMode:
    result = await db.execute(select(MaintenanceMode).where(MaintenanceMode.id == SINGLETON_ID))
    obj = result.scalar_one_or_none()
    if not obj:
        obj = MaintenanceMode(
            id=SINGLETON_ID,
            is_active=False,
            title="Platform Under Maintenance",
            message="We are performing scheduled maintenance to improve your experience. We'll be back soon.",
        )
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
    return obj


async def update_maintenance(db: AsyncSession, is_active: bool, title: str, message: str, ends_at, updated_by) -> MaintenanceMode:
    obj = await get_or_create(db)
    obj.is_active = is_active
    obj.title = title
    obj.message = message
    obj.ends_at = ends_at
    obj.updated_by = updated_by
    await db.commit()
    await db.refresh(obj)
    return obj
