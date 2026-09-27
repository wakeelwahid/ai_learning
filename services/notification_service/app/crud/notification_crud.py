"""
CRUD helpers for the Notification model.

All functions accept an AsyncSession and commit their own writes.
"""
import uuid

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import (
    PREFERENCE_EVENT_KEYS,
    Notification,
    NotificationPreference,
    NotificationStatus,
    NotificationType,
)


async def get_push_token_for_user(db: AsyncSession, user_id: uuid.UUID) -> str | None:
    """Return one registered device token for `user_id`, if any."""
    result = await db.execute(
        text("SELECT token FROM push_tokens WHERE user_id = :uid LIMIT 1"),
        {"uid": str(user_id)},
    )
    row = result.first()
    return row[0] if row else None


async def create_notification(
    db: AsyncSession,
    user_id: uuid.UUID,
    notif_type: NotificationType,
    title: str,
    body: str,
    template: str | None = None,
) -> Notification:
    """Insert a single notification record, commit, and return it."""
    notification = Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        body=body,
        status=NotificationStatus.PENDING,
    )
    if template:
        notification.template = template[:100]
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification


async def create_bulk_notifications(
    db: AsyncSession,
    items: list[dict],
) -> list[str]:
    """
    Bulk-insert notification records and return a list of their string IDs.

    Each dict in *items* must contain: user_id, type, title, body.
    """
    notifications = [
        Notification(
            user_id=item["user_id"],
            type=item["type"],
            title=item["title"],
            body=item["body"],
            status=NotificationStatus.PENDING,
        )
        for item in items
    ]
    db.add_all(notifications)
    await db.commit()
    return [str(n.id) for n in notifications]


async def get_user_notifications(
    db: AsyncSession,
    user_id: uuid.UUID,
    unread_only: bool = False,
    limit: int = 50,
) -> list:
    """Return up to `limit` notifications for a user, newest first."""
    query = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        query = query.where(Notification.is_read == False)  # noqa: E712
    query = query.order_by(Notification.created_at.desc()).limit(min(limit, 200))
    result = await db.execute(query)
    return result.scalars().all()


async def mark_all_notifications_read(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> int:
    """Mark all unread notifications for a user as read. Returns count updated."""
    result = await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
        .values(is_read=True)
        .returning(Notification.id)
    )
    rows = result.fetchall()
    await db.commit()
    return len(rows)


async def mark_notifications_read(
    db: AsyncSession,
    notification_ids: list[uuid.UUID],
    user_id: uuid.UUID,
) -> int:
    """Mark the given notifications as read, restricted to those owned by
    *user_id*, and return the count actually updated."""
    result = await db.execute(
        update(Notification)
        .where(Notification.id.in_(notification_ids), Notification.user_id == user_id)
        .values(is_read=True)
        .returning(Notification.id)
    )
    rows = result.fetchall()
    await db.commit()
    return len(rows)


async def get_notification(
    db: AsyncSession,
    notification_id: uuid.UUID,
) -> Notification | None:
    """Fetch a single notification by primary key, or None if not found."""
    return await db.get(Notification, notification_id)


async def get_or_create_preferences(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> NotificationPreference:
    """Return preferences for *user_id*, creating a default row if none exist."""
    result = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == user_id)
    )
    prefs = result.scalar_one_or_none()
    if prefs is None:
        prefs = NotificationPreference(user_id=user_id)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)
    return prefs


async def get_event_channel_prefs(
    db: AsyncSession,
    user_id: uuid.UUID,
    event: str | None,
) -> dict[str, bool]:
    enabled = {"in_app": True, "push": True, "email": True}
    if not event or event not in PREFERENCE_EVENT_KEYS:
        return enabled
    result = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == user_id)
    )
    prefs = result.scalar_one_or_none()
    if prefs is None:
        return enabled
    for channel in enabled:
        value = getattr(prefs, f"{channel}_{event}", None)
        if value is False:
            enabled[channel] = False
    return enabled


async def update_preferences(
    db: AsyncSession,
    user_id: uuid.UUID,
    updates: dict,
) -> NotificationPreference:
    """Apply a partial update dict to the user's preferences row (upsert)."""
    prefs = await get_or_create_preferences(db, user_id)
    for field, value in updates.items():
        if value is not None:
            setattr(prefs, field, value)
    await db.commit()
    await db.refresh(prefs)
    return prefs
