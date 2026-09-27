import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import LoginBackground

MAX_LOGIN_BACKGROUNDS = 4


async def list_login_backgrounds(db: AsyncSession) -> list[LoginBackground]:
    """Metadata only — callers use ser_login_background(), which never touches
    image_bytes, so this is cheap even though the column exists on the model."""
    stmt = select(LoginBackground).order_by(LoginBackground.created_at)
    return (await db.execute(stmt)).scalars().all()


async def count_login_backgrounds(db: AsyncSession) -> int:
    rows = await list_login_backgrounds(db)
    return len(rows)


async def get_active_login_background(db: AsyncSession) -> LoginBackground | None:
    stmt = select(LoginBackground).where(LoginBackground.is_active == True)  # noqa: E712
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_login_background_bytes(db: AsyncSession, background_id: uuid.UUID) -> LoginBackground | None:
    stmt = select(LoginBackground).where(LoginBackground.id == background_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_login_background(
    db: AsyncSession, image_bytes: bytes, image_mime: str, uploaded_by: uuid.UUID,
) -> LoginBackground:
    """Inserts a new row. The first image ever uploaded becomes active
    automatically; later uploads stay inactive until an admin selects them."""
    existing_active = await get_active_login_background(db)
    row = LoginBackground(
        image_bytes=image_bytes,
        image_mime=image_mime,
        uploaded_by=uploaded_by,
        is_active=existing_active is None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def set_active_login_background(db: AsyncSession, background_id: uuid.UUID) -> LoginBackground | None:
    """Atomically makes `background_id` the only active row."""
    target = (await db.execute(
        select(LoginBackground).where(LoginBackground.id == background_id)
    )).scalar_one_or_none()
    if not target:
        return None
    await db.execute(update(LoginBackground).values(is_active=False))
    target.is_active = True
    await db.commit()
    await db.refresh(target)
    return target


async def delete_login_background(db: AsyncSession, background_id: uuid.UUID) -> LoginBackground | None:
    """Deletes a row. If it was active, promotes the oldest remaining row
    (if any) to active so the login screen never ends up with none set."""
    row = (await db.execute(
        select(LoginBackground).where(LoginBackground.id == background_id)
    )).scalar_one_or_none()
    if not row:
        return None
    was_active = row.is_active
    await db.delete(row)
    await db.commit()

    if was_active:
        remaining = (await db.execute(
            select(LoginBackground).order_by(LoginBackground.created_at)
        )).scalars().first()
        if remaining:
            remaining.is_active = True
            await db.commit()
    return row
