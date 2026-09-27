"""
Notification API routes.

All outbound sends (email, push, WhatsApp) return 202 Accepted immediately.
Actual delivery is handled by the Celery worker in the background.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, require_admin, require_internal
from app.database.session import get_db
from app.models.contact_message import ContactMessage
from app.models.notification import Notification, NotificationType, ScheduledNudge
from app.tasks.notifications import (
    broadcast_task,
    send_email_task,
    send_push_task,
    send_sms_sync,
    send_whatsapp_task,
)
from app.crud.notification_crud import (
    create_notification,
    create_bulk_notifications,
    get_push_token_for_user,
    get_user_notifications,
    mark_notifications_read,
    mark_all_notifications_read,
    get_notification,
    get_event_channel_prefs,
    get_or_create_preferences,
    update_preferences,
)
from app.crud.push_crud import upsert_token, delete_token
from app.schemas.notification import (
    BroadcastRequest,
    ContactMessageRequest,
    ContactMessageResponse,
    FeedbackRequest,
    MarkReadRequest,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    NotificationStatusResponse,
    QueuedResponse,
    ScheduleNudgeRequest,
    ScheduleNudgeResponse,
    SendEmailRequest,
    SendPushRequest,
    SendSMSRequest,
    SendWhatsAppRequest,
    SMSSentResponse,
    RegisterPushTokenRequest,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/internal/notify", status_code=202, dependencies=[Depends(require_internal)])
async def internal_notify(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Service-to-service notification: persist a durable in-app
    Notification row for the TARGET user (something the JWT-gated /push/send
    can't do — it only pushes to the caller's own devices), then best-effort
    enqueue real push delivery over Celery/RabbitMQ if the user has a
    registered device token. Used by user_service for friend-request /
    friend-accepted events. Body: {user_id, title, body, template?, event?}."""
    try:
        target = uuid.UUID(str(payload.get("user_id", "")))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")
    title = str(payload.get("title", "")).strip()[:200]
    body_txt = str(payload.get("body", "")).strip()
    template = (str(payload.get("template", "")).strip() or None)
    event = (str(payload.get("event", "")).strip() or None)
    if not title or not body_txt:
        raise HTTPException(status_code=400, detail="title and body are required")

    channels = await get_event_channel_prefs(db, target, event)

    notif_id = None
    stored = False
    if channels["in_app"]:
        notif = await create_notification(db, target, NotificationType.PUSH, title, body_txt, template=template)
        notif_id = str(notif.id)
        stored = True

    queued = False
    if channels["push"]:
        try:
            token = await get_push_token_for_user(db, target)
            if token:
                send_push_task.delay(notif_id or str(uuid.uuid4()), token, title, body_txt)
                queued = True
        except Exception:  # noqa: BLE001 — the durable in-app row already landed
            pass

    return {"notification_id": notif_id, "push_queued": queued, "queued": queued, "stored": stored}


@router.post("/internal/schedule-nudge", status_code=202, response_model=ScheduleNudgeResponse,
             dependencies=[Depends(require_internal)])
async def internal_schedule_nudge(
    body: ScheduleNudgeRequest,
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Queue a nudge for DELAYED delivery — quiz_service calls
    this right after detecting a weak topic on quiz submission, but the
    notification itself only lands delay_hours later (product decision: a
    nudge fired the instant the quiz ends reads as nagging, not coaching).
    The send_weak_topic_nudges scheduler job (streak_reminders.py) polls
    for due rows and turns each into a real Notification exactly once."""
    fire_at = datetime.now(timezone.utc) + timedelta(hours=body.delay_hours)
    nudge = ScheduledNudge(
        user_id=body.user_id, nudge_type=body.nudge_type,
        title=body.title, body=body.body, fire_at=fire_at,
    )
    db.add(nudge)
    await db.commit()
    await db.refresh(nudge)
    return ScheduleNudgeResponse(scheduled=True, nudge_id=nudge.id, fire_at=nudge.fire_at)


@router.post("/internal/sms", status_code=200, response_model=SMSSentResponse, dependencies=[Depends(require_internal)])
async def internal_send_sms(body: SendSMSRequest):
    """[Internal] Synchronous plain-SMS send — used by auth_service for OTP
    delivery, which needs to know immediately whether the SMS actually went
    out (unlike the other channels, this is NOT queued via Celery: the OTP
    is time-sensitive and the caller must be able to surface a real failure
    to the user instead of a false 'code sent')."""
    sent = send_sms_sync(body.phone, body.message)
    return SMSSentResponse(sent=sent)


async def _queue_email(body: SendEmailRequest, db: AsyncSession) -> QueuedResponse:
    to_email = body.resolved_to_email()
    html_body = body.resolved_html_body()
    user_id = body.user_id or uuid.uuid4()
    notification = await create_notification(
        db,
        user_id=user_id,
        notif_type=NotificationType.EMAIL,
        title=body.subject,
        body=html_body,
    )
    nid = str(notification.id)

    send_email_task.delay(
        notification_id=nid,
        to_email=to_email,
        subject=body.subject,
        html_body=html_body,
        text_body=body.text_body,
    )
    return QueuedResponse(queued=True, notification_id=nid)


@router.post("/email", status_code=200, response_model=QueuedResponse, dependencies=[Depends(require_admin)])
async def send_email(body: SendEmailRequest, db: AsyncSession = Depends(get_db)):
    """Queue an email for delivery. Returns 202 immediately. [Admin only — sends to arbitrary users via the admin panel]"""
    return await _queue_email(body, db)


@router.post("/internal/email", status_code=200, response_model=QueuedResponse, dependencies=[Depends(require_internal)])
async def internal_send_email(body: SendEmailRequest, db: AsyncSession = Depends(get_db)):
    """[Internal] Same as POST /email but network-gated instead of admin-JWT-gated —
    used by auth_service's fire_email() (OTP-verification, password-reset emails),
    which has no end-user JWT to send at that call site. The admin-facing /email
    route intentionally stays require_admin; this route exists so a genuine
    service-to-service caller doesn't need to fake up an admin token."""
    return await _queue_email(body, db)


@router.post("/broadcast", status_code=200, dependencies=[Depends(require_admin)])
async def broadcast(body: BroadcastRequest, db: AsyncSession = Depends(get_db)):
    """[Admin] Queue a broadcast notification. Accepts {title, message, target} or {subject, html_body, to_emails}."""
    subject = body.resolved_subject()
    html_body = body.resolved_html_body()
    to_emails = body.to_emails

    # target="all" → system-wide broadcast (no email list required)
    if body.target == "all" or not to_emails:
        notification = await create_notification(
            db,
            user_id=uuid.uuid4(),
            notif_type=NotificationType.EMAIL,
            title=subject,
            body=html_body,
        )
        return {"queued": True, "count": 0, "notification_ids": [str(notification.id)]}

    items = [
        {
            "user_id": uuid.uuid4(),
            "type": NotificationType.EMAIL,
            "title": subject,
            "body": html_body,
        }
        for _ in to_emails
    ]
    nids = await create_bulk_notifications(db, items)

    broadcast_task.delay(
        subject=subject,
        html_body=html_body,
        to_emails=to_emails,
        notification_ids=nids,
    )
    return {"queued": True, "count": len(to_emails), "notification_ids": nids}


@router.post("/push", status_code=202, response_model=QueuedResponse, dependencies=[Depends(require_admin)])
async def send_push(body: SendPushRequest, db: AsyncSession = Depends(get_db)):
    """[Admin/service only] Queue a Firebase Cloud Messaging push notification."""
    notification = await create_notification(
        db,
        user_id=body.user_id,
        notif_type=NotificationType.PUSH,
        title=body.title,
        body=body.body,
    )
    nid = str(notification.id)

    send_push_task.delay(
        notification_id=nid,
        device_token=body.device_token,
        title=body.title,
        body=body.body,
        data=body.data,
    )
    return QueuedResponse(queued=True, notification_id=nid)


@router.post("/whatsapp", status_code=202, response_model=QueuedResponse, dependencies=[Depends(require_admin)])
async def send_whatsapp(body: SendWhatsAppRequest, db: AsyncSession = Depends(get_db)):
    """[Admin/service only] Queue a WhatsApp message."""
    notification = await create_notification(
        db,
        user_id=body.user_id,
        notif_type=NotificationType.WHATSAPP,
        title="WhatsApp Message",
        body=body.message,
    )
    nid = str(notification.id)

    send_whatsapp_task.delay(
        notification_id=nid,
        phone=body.phone,
        message=body.message,
    )
    return QueuedResponse(queued=True, notification_id=nid)


@router.post("/push-token", status_code=201)
async def register_push_token_flat(
    body: RegisterPushTokenRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Flat-path alias for /push/token — registers an FCM device token.
    user_id is always taken from the verified JWT (Bearer token); any
    user_id supplied in the request body is ignored."""
    await upsert_token(db, caller_id, body.token, body.platform, body.device_id)
    return {"status": "registered"}


@router.delete("/push-token/{device_id}", status_code=200)
async def unregister_push_token(
    device_id: str,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Remove one device's push token — called on logout / explicit device
    removal so a signed-out device stops receiving push after this point.
    Scoped to the caller's own tokens (device_id alone can't target another
    user's row, since delete_token filters on caller_id too)."""
    deleted = await delete_token(db, caller_id, device_id)
    return {"deleted": deleted}


@router.get("/user/{user_id}")
async def list_user_notifications(
    user_id: uuid.UUID,
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return up to `limit` notifications for the authenticated user, newest first."""
    if user_id != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")
    notifications = await get_user_notifications(db, user_id=caller_id, unread_only=unread_only, limit=limit)
    return {"notifications": notifications, "total": len(notifications)}


@router.patch("/user/{user_id}/read")
async def mark_all_read(
    user_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Mark all unread notifications for the authenticated user as read."""
    if user_id != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")
    updated = await mark_all_notifications_read(db, user_id=caller_id)
    return {"updated": updated}


@router.post("/mark-read")
async def mark_read(
    body: MarkReadRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Mark the specified notifications as read (only those owned by the caller)."""
    updated = await mark_notifications_read(db, notification_ids=body.notification_ids, user_id=caller_id)
    return {"updated": updated}


@router.get("/status/{notification_id}", response_model=NotificationStatusResponse)
async def get_notification_status(
    notification_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return the current status and type of a notification owned by the caller."""
    n = await get_notification(db, notification_id=notification_id)
    if not n or n.user_id != caller_id:
        raise HTTPException(status_code=404, detail="Notification not found")
    return NotificationStatusResponse(id=str(n.id), status=n.status.value, type=n.type.value)


@router.get("/preferences/{user_id}", response_model=NotificationPreferenceResponse)
async def get_preferences(
    user_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return notification preferences for the authenticated user, creating defaults if none exist."""
    if user_id != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")
    prefs = await get_or_create_preferences(db, user_id=caller_id)
    return prefs


@router.put("/preferences/{user_id}", response_model=NotificationPreferenceResponse)
async def put_preferences(
    user_id: uuid.UUID,
    body: NotificationPreferenceUpdate,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Update notification preferences for the authenticated user (partial update, upsert)."""
    if user_id != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")
    prefs = await update_preferences(
        db,
        user_id=caller_id,
        updates=body.model_dump(exclude_none=True),
    )
    return prefs


@router.get("/preferences", response_model=NotificationPreferenceResponse)
async def get_preferences_by_query(
    user_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return notification preferences for the authenticated user (user_id as query param), creating defaults if none exist."""
    if user_id != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")
    prefs = await get_or_create_preferences(db, user_id=caller_id)
    return prefs


@router.patch("/preferences", response_model=NotificationPreferenceResponse)
async def patch_preferences_by_query(
    user_id: uuid.UUID,
    body: NotificationPreferenceUpdate,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Partially update notification preferences for the authenticated user (user_id as query param, upsert)."""
    if user_id != caller_id:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")
    prefs = await update_preferences(
        db,
        user_id=caller_id,
        updates=body.model_dump(exclude_none=True),
    )
    return prefs


@router.post("/feedback", status_code=200)
async def submit_feedback(
    body: FeedbackRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    """Accept user feedback (rating, category, message). Logs the submission.

    The attributed user is the authenticated caller, never body.user_id: this
    route had no auth dependency at all, so the client-supplied id meant
    anyone could file feedback under any user's identity (the sibling
    /contact route's docstring already described this route as requiring an
    authenticated user_id — it just never enforced it). body.user_id is kept
    on the schema for backward compatibility with existing clients but is
    deliberately not what gets logged.
    """
    logging.getLogger("feedback").info(
        "Feedback received | user=%s rating=%s category=%s | %s",
        caller_id, body.rating, body.category, body.message[:200],
    )
    return {"received": True, "message": "Thank you for your feedback!"}


@router.post("/contact", response_model=ContactMessageResponse, status_code=201)
async def submit_contact_message(body: ContactMessageRequest, db: AsyncSession = Depends(get_db)):
    """Public, unauthenticated Contact Us submission — persisted (unlike
    /feedback, which is log-only and requires an authenticated user_id) so
    an admin actually has something to read. No end-user auth dependency by
    design: anyone reaching the public Contact page can submit one."""
    msg = ContactMessage(
        name=body.name, email=body.email, subject=body.subject, message=body.message,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return ContactMessageResponse(id=msg.id)
