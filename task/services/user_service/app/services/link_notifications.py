"""In-app + push notifications for parent–student events (link lifecycle,
purchase approvals, meeting updates).

Fire-and-forget: failing to notify must never fail the operation itself.
Delivery goes through notification_service's internal /notify route (same
pattern as routes/chat.py's notify_persistent), which persists an in-app
Notification row for the target user and enqueues a push when they have a
registered device token. `event` names the parent-preference key
notification_service uses to honour per-channel opt-outs.
"""
import uuid
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud import user_crud

EVENT_PARENT_LINK = "parent_link"
EVENT_PURCHASE_APPROVAL = "purchase_approval"
EVENT_MEETING_UPDATE = "meeting_update"

DISPLAY_TZ = ZoneInfo("Asia/Kolkata")


async def _notify(user_id: uuid.UUID, title: str, body: str, template: str, event: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{settings.NOTIFICATION_SERVICE_URL}/api/v1/notifications/internal/notify",
                json={
                    "user_id": str(user_id),
                    "title": title,
                    "body": body,
                    "template": template,
                    "event": event,
                },
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:  # noqa: BLE001
        pass


async def _name(db: AsyncSession, user_id: uuid.UUID, fallback: str) -> str:
    profile = await user_crud.get_profile(db, user_id)
    name = (profile.full_name or "").strip() if profile else ""
    return name or fallback


# ── Parent-student links ───────────────────────────────────────────────────────

# `link` only needs .parent_user_id / .student_user_id / .relationship /
# .is_approved — callers pass either the ORM row or a plain snapshot taken
# before a delete (an ORM row's attributes are expired after commit).
async def notify_link_requested(db: AsyncSession, link: Any) -> None:
    parent = await _name(db, link.parent_user_id, "A parent")
    await _notify(
        link.student_user_id,
        "Parent link request",
        f"{parent} wants to link to your account as your {link.relationship}. "
        "Open Profile → Linked Parents to approve or decline.",
        "parent_link_requested",
        EVENT_PARENT_LINK,
    )


async def notify_link_approved(db: AsyncSession, link: Any) -> None:
    student = await _name(db, link.student_user_id, "Your child")
    await _notify(
        link.parent_user_id,
        "Link approved",
        f"{student} approved your request. Their dashboard, progress and study limits are now available.",
        "parent_link_approved",
        EVENT_PARENT_LINK,
    )


async def notify_link_removed(db: AsyncSession, link: Any, removed_by: str) -> None:
    if removed_by == "student":
        student = await _name(db, link.student_user_id, "Your child")
        if link.is_approved:
            title, body = "Link removed", f"{student} is no longer linked to your account."
        else:
            title, body = "Link request declined", f"{student} declined your link request."
        await _notify(link.parent_user_id, title, body, "parent_link_removed", EVENT_PARENT_LINK)
    elif removed_by == "parent":
        parent = await _name(db, link.parent_user_id, "A parent")
        await _notify(
            link.student_user_id,
            "Parent link removed",
            f"{parent} removed the link to your account. They can no longer see your dashboard or progress.",
            "parent_link_removed",
            EVENT_PARENT_LINK,
        )


# ── Purchase approvals ─────────────────────────────────────────────────────────

def _format_amount(amount: Any) -> str | None:
    if amount is None:
        return None
    value = float(amount)
    return f"{int(value)}" if value.is_integer() else f"{value:.2f}"


async def notify_purchase_approval_requested(db: AsyncSession, row: Any) -> None:
    student = await _name(db, row.student_user_id, "Your child")
    amount = _format_amount(row.amount)
    price = f" (₹{amount})" if amount is not None else ""
    await _notify(
        row.parent_user_id,
        "Purchase approval needed",
        f"{student} wants to buy {row.title}{price}. Open your dashboard to approve or decline.",
        "purchase_approval_request",
        EVENT_PURCHASE_APPROVAL,
    )


async def notify_purchase_approval_decided(row: Any) -> None:
    if row.status == "approved":
        title = "Purchase approved"
        body = f"Purchase approved — you can now buy {row.title}."
    else:
        title = "Purchase declined"
        note = (row.note or "").strip()
        body = f"Purchase declined: {note}" if note else "Purchase declined"
    await _notify(row.student_user_id, title, body, "purchase_approval_decided", EVENT_PURCHASE_APPROVAL)


# ── Meetings ───────────────────────────────────────────────────────────────────

def _format_meeting_time(when: datetime) -> str:
    return when.astimezone(DISPLAY_TZ).strftime("%d %b, %H:%M")


async def notify_meeting_updated(row: Any) -> None:
    if row.status == "confirmed":
        when = _format_meeting_time(row.scheduled_at or row.preferred_at)
        link = f" — {row.meeting_link}" if row.meeting_link else ""
        title, body = "Meeting confirmed", f"Meeting confirmed for {when}{link}"
    elif row.status == "declined":
        note = (row.admin_note or "").strip()
        title = "Meeting request declined"
        body = f"Meeting request declined: {note}" if note else "Meeting request declined"
    else:
        return
    await _notify(row.parent_user_id, title, body, "meeting_update", EVENT_MEETING_UPDATE)
