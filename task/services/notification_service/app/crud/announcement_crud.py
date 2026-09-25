"""CRUD helpers for the Announcement model."""
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.announcement import Announcement


def now() -> datetime:
    return datetime.now(timezone.utc)


async def list_announcements(db: AsyncSession, active_only: bool, limit: int) -> list[Announcement]:
    stmt = select(Announcement)
    if active_only:
        n = now()
        stmt = stmt.where(
            and_(
                Announcement.is_active.is_(True),
                Announcement.release_date <= n,
                or_(Announcement.expires_at.is_(None), Announcement.expires_at > n),
            )
        )
    stmt = stmt.order_by(Announcement.is_pinned.desc(), Announcement.release_date.desc()).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def create_announcement(db: AsyncSession, body) -> Announcement:
    obj = Announcement(
        title=body.title,
        body=body.body,
        type=body.type,
        link_url=body.link_url,
        image_url=body.image_url,
        release_date=body.release_date or now(),
        expires_at=body.expires_at,
        is_active=body.is_active,
        is_pinned=body.is_pinned,
        created_by=body.created_by,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_announcement(db: AsyncSession, announcement_id: UUID) -> Announcement | None:
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    return result.scalar_one_or_none()


async def update_announcement(db: AsyncSession, obj: Announcement, updates: dict) -> Announcement:
    for field, value in updates.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


async def delete_announcement(db: AsyncSession, obj: Announcement) -> None:
    await db.delete(obj)
    await db.commit()
