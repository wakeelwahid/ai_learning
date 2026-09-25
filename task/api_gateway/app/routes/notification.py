from fastapi import Request, Response, APIRouter

from app.core.rest_router import rest_router
from app.services import notification_svc
from app.schemas import ContactMessageMarkReadRequest, ContactMessageRequest, SendEmailRequest

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


@rest_router(router.post, path="/email", proxy=notification_svc,
    summary="Send a transactional email")
async def send_email(request: Request, response: Response, data: SendEmailRequest):
    pass

@rest_router(router.get, path="/user/{user_id}", proxy=notification_svc,
    summary="Get notification history for a user")
async def user_notifications(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.post, path="/broadcast", proxy=notification_svc,
    summary="[Admin] Broadcast to all / segment of users")
async def broadcast(request: Request, response: Response):
    pass

@rest_router(router.post, path="/push", proxy=notification_svc,
    summary="Send a push notification to a device token")
async def send_push(request: Request, response: Response):
    pass

@rest_router(router.post, path="/push/token", proxy=notification_svc, status_code=201,
    summary="Register an FCM push token for a user")
async def register_push_token(request: Request, response: Response):
    pass

@rest_router(router.post, path="/push-token", proxy=notification_svc, status_code=201,
    summary="Register an FCM push token for a user (flat path)")
async def register_push_token_flat(request: Request, response: Response):
    pass

@rest_router(router.delete, path="/push-token/{device_id}", proxy=notification_svc,
    summary="Remove one device's push token (logout / device removal)")
async def unregister_push_token(request: Request, response: Response, device_id: str):
    pass

@rest_router(router.post, path="/push/send", proxy=notification_svc,
    summary="Send FCM push notification to a user's registered tokens")
async def send_push_to_user(request: Request, response: Response):
    pass

@rest_router(router.post, path="/whatsapp", proxy=notification_svc,
    summary="Send a WhatsApp message via configured provider")
async def send_whatsapp(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/user/{user_id}/read", proxy=notification_svc,
    summary="Mark all notifications read for a user")
async def mark_read(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.post, path="/mark-read", proxy=notification_svc,
    summary="Mark specific notifications as read")
async def mark_read_bulk(request: Request, response: Response):
    pass

@rest_router(router.get, path="/status/{notification_id}", proxy=notification_svc,
    summary="Get delivery status of a notification")
async def notification_status(request: Request, response: Response, notification_id: str):
    pass

@rest_router(router.get, path="/preferences/{user_id}", proxy=notification_svc,
    summary="Get (or create default) notification preferences for a user (path param)")
async def get_preferences(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.put, path="/preferences/{user_id}", proxy=notification_svc,
    summary="Update notification preferences for a user (path param)")
async def put_preferences(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/preferences", proxy=notification_svc,
    summary="Get notification preferences for the authenticated user (query param user_id)")
async def get_preferences_me(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/preferences", proxy=notification_svc,
    summary="Partially update notification preferences for the authenticated user")
async def patch_preferences_me(request: Request, response: Response):
    pass

@rest_router(router.get, path="/messages/threads", proxy=notification_svc,
    summary="List message threads for a user")
async def list_message_threads(request: Request, response: Response):
    pass

@rest_router(router.post, path="/messages/threads", proxy=notification_svc, status_code=201,
    summary="Create a new message thread")
async def create_message_thread(request: Request, response: Response):
    pass

@rest_router(router.get, path="/messages/threads/{thread_id}", proxy=notification_svc,
    summary="Get messages in a thread (marks as read)")
async def get_message_thread(request: Request, response: Response, thread_id: str):
    pass

@rest_router(router.post, path="/messages/threads/{thread_id}", proxy=notification_svc, status_code=201,
    summary="Send a message in an existing thread")
async def send_thread_message(request: Request, response: Response, thread_id: str):
    pass


# ── Admin trigger routes (forwarded to notification_service) ───────────────

@rest_router(router.post, path="/feedback", proxy=notification_svc,
    summary="Submit user feedback")
async def submit_feedback(request: Request, response: Response):
    pass

@rest_router(router.post, path="/contact", proxy=notification_svc, status_code=201,
    summary="Submit a public Contact Us message (no login required)")
async def submit_contact_message(request: Request, response: Response, data: ContactMessageRequest):
    pass

@rest_router(router.post, path="/admin/trigger-streak-reminder", proxy=notification_svc,
    summary="[Admin] Immediately run the primary streak-reminder job")
async def admin_trigger_streak_reminder(request: Request, response: Response):
    pass

@rest_router(router.post, path="/admin/trigger-weekly-report", proxy=notification_svc,
    summary="[Admin] Immediately run the weekly student report job")
async def admin_trigger_weekly_report(request: Request, response: Response):
    pass

@rest_router(router.post, path="/admin/trigger-parent-summary", proxy=notification_svc,
    summary="[Admin] Immediately run the parent weekly summary job")
async def admin_trigger_parent_summary(request: Request, response: Response):
    pass

@rest_router(router.post, path="/admin/trigger-winback", proxy=notification_svc,
    summary="[Admin] Immediately run the dormant-user win-back job (3/7/30-day tiers)")
async def admin_trigger_winback(request: Request, response: Response):
    pass

@rest_router(router.post, path="/admin/trigger-deliver-nudges", proxy=notification_svc,
    summary="[Admin] Immediately deliver any due ScheduledNudge rows")
async def admin_trigger_deliver_nudges(request: Request, response: Response):
    pass

@rest_router(router.get, path="/admin/contact-messages", proxy=notification_svc,
    summary="[Admin] List Contact Us submissions")
async def admin_list_contact_messages(request: Request, response: Response):
    pass

@rest_router(router.get, path="/admin/contact-messages/unread-count", proxy=notification_svc,
    summary="[Admin] Count of unread Contact Us submissions")
async def admin_count_unread_contact_messages(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/admin/contact-messages/{message_id}", proxy=notification_svc,
    summary="[Admin] Mark a Contact Us submission read/unread")
async def admin_mark_contact_message(request: Request, response: Response, message_id: str, data: ContactMessageMarkReadRequest):
    pass


# ── Maintenance mode ──────────────────────────────────────────────────────────

@rest_router(router.get, path="/maintenance", proxy=notification_svc,
    summary="Get maintenance status (public)")
async def get_maintenance(request: Request, response: Response):
    pass

@rest_router(router.post, path="/maintenance", proxy=notification_svc,
    summary="[Admin] Set maintenance mode on/off")
async def set_maintenance(request: Request, response: Response):
    pass


# ── Announcements ──────────────────────────────────────────────────────────────

@rest_router(router.get, path="/announcements", proxy=notification_svc,
    summary="List active announcements (user-facing)")
async def list_announcements(request: Request, response: Response):
    pass

@rest_router(router.post, path="/announcements", proxy=notification_svc, status_code=201,
    summary="[Admin] Create an announcement")
async def create_announcement(request: Request, response: Response):
    pass

@rest_router(router.put, path="/announcements/{announcement_id}", proxy=notification_svc,
    summary="[Admin] Update an announcement")
async def update_announcement(request: Request, response: Response, announcement_id: str):
    pass

@rest_router(router.delete, path="/announcements/{announcement_id}", proxy=notification_svc,
    summary="[Admin] Delete an announcement")
async def delete_announcement(request: Request, response: Response, announcement_id: str):
    pass
