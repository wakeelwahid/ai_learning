"""
Admin trigger endpoints for manually firing scheduled notification jobs.

All endpoints require a JWT with admin/super_admin role (see
``app.core.dependencies.require_admin``). These routes exist primarily for
testing, on-call debugging, and backfill operations — they are NOT intended
for end-user consumption.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.database.session import AsyncSessionLocal, get_db
from app.models.contact_message import ContactMessage
from app.schedulers.streak_reminders import (
    deliver_due_nudges,
    send_parent_weekly_summary,
    send_streak_reminder_primary,
    send_weekly_student_report,
    send_winback_notifications,
)
from app.schemas.notification import ContactMessageAdminResponse, ContactMessageMarkReadRequest

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/notifications/admin",
    tags=["Notifications — Admin Triggers"],
)


# ---------------------------------------------------------------------------
# Trigger endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/trigger-streak-reminder",
    summary="[Admin] Immediately run the primary streak-reminder job",
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_streak_reminder(
    _admin_id: uuid.UUID = Depends(require_admin),
) -> dict:
    """
    Fires ``send_streak_reminder_primary`` immediately, outside of its normal
    cron schedule.  Useful for testing or for replaying a missed run.
    """
    logger.info("Admin triggered: send_streak_reminder_primary")
    try:
        await send_streak_reminder_primary(db_factory=AsyncSessionLocal)
    except Exception as exc:  # noqa: BLE001
        logger.error("Admin trigger send_streak_reminder_primary failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Job failed: {exc}",
        ) from exc
    return {"triggered": "streak_reminder_primary", "status": "accepted"}


@router.post(
    "/trigger-weekly-report",
    summary="[Admin] Immediately run the weekly student report job",
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_weekly_report(
    _admin_id: uuid.UUID = Depends(require_admin),
) -> dict:
    """
    Fires ``send_weekly_student_report`` immediately, outside of its normal
    Sunday cron schedule.
    """
    logger.info("Admin triggered: send_weekly_student_report")
    try:
        await send_weekly_student_report(db_factory=AsyncSessionLocal)
    except Exception as exc:  # noqa: BLE001
        logger.error("Admin trigger send_weekly_student_report failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Job failed: {exc}",
        ) from exc
    return {"triggered": "weekly_student_report", "status": "accepted"}


@router.post(
    "/trigger-parent-summary",
    summary="[Admin] Immediately run the parent weekly summary job",
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_parent_summary(
    _admin_id: uuid.UUID = Depends(require_admin),
) -> dict:
    """
    Fires ``send_parent_weekly_summary`` immediately, outside of its normal
    Monday cron schedule.
    """
    logger.info("Admin triggered: send_parent_weekly_summary")
    try:
        await send_parent_weekly_summary(db_factory=AsyncSessionLocal)
    except Exception as exc:  # noqa: BLE001
        logger.error("Admin trigger send_parent_weekly_summary failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Job failed: {exc}",
        ) from exc
    return {"triggered": "parent_weekly_summary", "status": "accepted"}


@router.post(
    "/trigger-winback",
    summary="[Admin] Immediately run the dormant-user win-back job (3/7/30-day tiers)",
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_winback(
    _admin_id: uuid.UUID = Depends(require_admin),
) -> dict:
    """
    Fires ``send_winback_notifications`` immediately, outside of its normal
    daily cron schedule. Queries auth_service for users whose last_login
    falls exactly 3, 7, or 30 days ago and creates a real notification for
    each — useful for testing the win-back copy/targeting without waiting
    for the schedule or for real dormant users to accumulate.
    """
    logger.info("Admin triggered: send_winback_notifications")
    try:
        await send_winback_notifications(db_factory=AsyncSessionLocal)
    except Exception as exc:  # noqa: BLE001
        logger.error("Admin trigger send_winback_notifications failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Job failed: {exc}",
        ) from exc
    return {"triggered": "winback_notifications", "status": "accepted"}


@router.post(
    "/trigger-deliver-nudges",
    summary="[Admin] Immediately deliver any due ScheduledNudge rows",
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_deliver_nudges(
    _admin_id: uuid.UUID = Depends(require_admin),
) -> dict:
    """Fires ``deliver_due_nudges`` immediately, outside its normal 15-minute
    poll — useful for testing a queued nudge without waiting."""
    logger.info("Admin triggered: deliver_due_nudges")
    try:
        await deliver_due_nudges(db_factory=AsyncSessionLocal)
    except Exception as exc:  # noqa: BLE001
        logger.error("Admin trigger deliver_due_nudges failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Job failed: {exc}",
        ) from exc
    return {"triggered": "deliver_due_nudges", "status": "accepted"}


# ---------------------------------------------------------------------------
# Contact Us inbox
# ---------------------------------------------------------------------------

@router.get(
    "/contact-messages",
    response_model=list[ContactMessageAdminResponse],
    summary="[Admin] List Contact Us submissions",
)
async def list_contact_messages(
    is_read: bool | None = Query(default=None, description="Filter by read status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[ContactMessage]:
    stmt = select(ContactMessage)
    if is_read is not None:
        stmt = stmt.where(ContactMessage.is_read == is_read)
    stmt = stmt.order_by(ContactMessage.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get(
    "/contact-messages/unread-count",
    summary="[Admin] Count of unread Contact Us submissions",
)
async def count_unread_contact_messages(
    _admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(func.count()).select_from(ContactMessage).where(ContactMessage.is_read.is_(False))
    )
    return {"unread": result.scalar_one()}


@router.patch(
    "/contact-messages/{message_id}",
    response_model=ContactMessageAdminResponse,
    summary="[Admin] Mark a Contact Us submission read/unread",
)
async def mark_contact_message(
    message_id: uuid.UUID,
    body: ContactMessageMarkReadRequest,
    _admin_id: uuid.UUID = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ContactMessage:
    msg = await db.get(ContactMessage, message_id)
    if msg is None:
        raise HTTPException(status_code=404, detail="Contact message not found")
    msg.is_read = body.is_read
    await db.commit()
    await db.refresh(msg)
    return msg
