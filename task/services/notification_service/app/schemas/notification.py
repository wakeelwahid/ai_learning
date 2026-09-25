import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

# Notification.title is String(200); Notification.body is unbounded Text.
_TITLE_MAX_LEN = 200
# Same E.164-ish pattern used by auth_service's phone field, for consistency.
_PHONE_PATTERN = r"^\+?[0-9]{7,15}$"


class SendEmailRequest(BaseModel):
    user_id: uuid.UUID | None = None
    to_email: EmailStr | None = None
    to: EmailStr | None = None           # alias for to_email
    subject: str = Field(min_length=1, max_length=_TITLE_MAX_LEN)
    html_body: str | None = None
    body: str | None = None         # alias for html_body
    text_body: str = ""

    @model_validator(mode="after")
    def _require_recipient_and_body(self) -> "SendEmailRequest":
        if not (self.to_email or self.to):
            raise ValueError("A recipient email (to_email or to) is required.")
        if not (self.html_body or self.body):
            raise ValueError("Email body (html_body or body) is required.")
        return self

    def resolved_to_email(self) -> str:
        return self.to_email or self.to or ""

    def resolved_html_body(self) -> str:
        return self.html_body or self.body or ""


class BroadcastRequest(BaseModel):
    subject: str | None = Field(default=None, max_length=_TITLE_MAX_LEN)
    title: str | None = Field(default=None, max_length=_TITLE_MAX_LEN)        # alias for subject
    html_body: str | None = None
    message: str | None = None      # alias for html_body
    # Capped so a single admin call can't silently fan out into an
    # unbounded number of queued notification tasks — 50,000 emails in one
    # request was accepted with no limit before this.
    to_emails: list[EmailStr] = Field(default=[], max_length=5_000)
    target: str | None = None       # "all" → system broadcast
    channels: list[Literal["email", "whatsapp", "push", "in_app"]] = ["email"]

    @model_validator(mode="after")
    def _require_subject_and_body(self) -> "BroadcastRequest":
        if not (self.subject or self.title):
            raise ValueError("A subject/title is required.")
        if not (self.html_body or self.message):
            raise ValueError("A message body is required.")
        return self

    def resolved_subject(self) -> str:
        return self.subject or self.title or "Broadcast"

    def resolved_html_body(self) -> str:
        return self.html_body or self.message or ""


class SendPushRequest(BaseModel):
    user_id: uuid.UUID
    device_token: str = Field(min_length=1, max_length=4096)
    title: str = Field(min_length=1, max_length=_TITLE_MAX_LEN)
    body: str = Field(min_length=1)
    data: dict | None = None


class SendWhatsAppRequest(BaseModel):
    user_id: uuid.UUID
    phone: str = Field(pattern=_PHONE_PATTERN)
    message: str = Field(min_length=1, max_length=4096)  # WhatsApp message cap


class SendSMSRequest(BaseModel):
    """No user_id — SMS OTP is sent before any account necessarily exists
    (see auth_service's phone-login flow)."""
    phone: str = Field(pattern=_PHONE_PATTERN)
    message: str = Field(min_length=1, max_length=320)  # plain SMS length cap (a few segments)


class SMSSentResponse(BaseModel):
    sent: bool


class ScheduleNudgeRequest(BaseModel):
    """Queue a nudge for delayed delivery — deliberately not immediate (see
    ScheduledNudge model comment). Callers pick delay_hours; the win-back-
    style scheduler job (send_weak_topic_nudges) delivers it once fire_at
    has passed."""
    user_id: uuid.UUID
    nudge_type: str = Field(min_length=1, max_length=50)
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=2000)
    delay_hours: float = Field(default=4.0, ge=0.1, le=48.0)


class ScheduleNudgeResponse(BaseModel):
    scheduled: bool
    nudge_id: uuid.UUID
    fire_at: datetime


class MarkReadRequest(BaseModel):
    notification_ids: list[uuid.UUID] = Field(min_length=1)


class QueuedResponse(BaseModel):
    queued: bool
    notification_id: str | None = None
    count: int | None = None


class NotificationStatusResponse(BaseModel):
    id: str
    status: str
    type: str


class NotificationPreferenceResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    in_app_new_video: bool
    in_app_quiz_result: bool
    in_app_battle_invite: bool
    in_app_streak_reminder: bool
    in_app_badge_unlocked: bool
    in_app_promotional: bool
    email_new_video: bool
    email_quiz_result: bool
    email_battle_invite: bool
    email_streak_reminder: bool
    email_badge_unlocked: bool
    email_promotional: bool
    whatsapp_new_video: bool
    whatsapp_quiz_result: bool
    whatsapp_battle_invite: bool
    whatsapp_streak_reminder: bool
    whatsapp_badge_unlocked: bool
    whatsapp_promotional: bool
    # In-app-only reminder schedule (Morning/Afternoon/Night)
    in_app_daily_goal_reminder: bool
    in_app_friend_activity: bool
    in_app_revision_reminder: bool
    in_app_parent_link: bool = True
    in_app_purchase_approval: bool = True
    in_app_child_weekly_summary: bool = True
    in_app_meeting_update: bool = True
    push_parent_link: bool = True
    push_purchase_approval: bool = True
    push_child_weekly_summary: bool = True
    push_meeting_update: bool = True
    email_parent_link: bool = True
    email_purchase_approval: bool = True
    email_child_weekly_summary: bool = True
    email_meeting_update: bool = True
    whatsapp_parent_link: bool = True
    whatsapp_purchase_approval: bool = True
    whatsapp_child_weekly_summary: bool = True
    whatsapp_meeting_update: bool = True
    updated_at: datetime

    model_config = {"from_attributes": True}


class RegisterPushTokenRequest(BaseModel):
    user_id: uuid.UUID | None = None  # optional — can be derived from Bearer token
    token: str = Field(min_length=1, max_length=500)     # PushToken.token is String(500)
    platform: Literal["ios", "android", "web"]
    # A stable per-install identifier (e.g. expo-application's androidId /
    # iosIdForVendor, or any client-generated UUID persisted on-device) so a
    # second device on the same platform doesn't evict the first device's
    # token. Falls back to the token value itself when omitted — still
    # correct for a single-device caller, but means a token rotation on a
    # client that never sends device_id creates a new row instead of
    # updating one; clients should send a real device_id going forward.
    device_id: str | None = Field(default=None, max_length=200)


class FeedbackRequest(BaseModel):
    user_id: uuid.UUID | None = None
    rating: int | None = Field(default=None, ge=1, le=5)       # 1–5 stars
    category: str | None = Field(default=None, max_length=50)  # e.g. "bug", "feature", "general"
    message: str = Field(min_length=1, max_length=5000)


class ContactMessageRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=255)
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=5000)


class ContactMessageResponse(BaseModel):
    id: uuid.UUID
    received: bool = True


class ContactMessageAdminResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    subject: str
    message: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ContactMessageMarkReadRequest(BaseModel):
    is_read: bool = True


class NotificationPreferenceUpdate(BaseModel):
    in_app_new_video: bool | None = None
    in_app_quiz_result: bool | None = None
    in_app_battle_invite: bool | None = None
    in_app_streak_reminder: bool | None = None
    in_app_badge_unlocked: bool | None = None
    in_app_promotional: bool | None = None
    email_new_video: bool | None = None
    email_quiz_result: bool | None = None
    email_battle_invite: bool | None = None
    email_streak_reminder: bool | None = None
    email_badge_unlocked: bool | None = None
    email_promotional: bool | None = None
    whatsapp_new_video: bool | None = None
    whatsapp_quiz_result: bool | None = None
    whatsapp_battle_invite: bool | None = None
    whatsapp_streak_reminder: bool | None = None
    whatsapp_badge_unlocked: bool | None = None
    whatsapp_promotional: bool | None = None
    in_app_daily_goal_reminder: bool | None = None
    in_app_friend_activity: bool | None = None
    in_app_revision_reminder: bool | None = None
    in_app_parent_link: bool | None = None
    in_app_purchase_approval: bool | None = None
    in_app_child_weekly_summary: bool | None = None
    in_app_meeting_update: bool | None = None
    push_parent_link: bool | None = None
    push_purchase_approval: bool | None = None
    push_child_weekly_summary: bool | None = None
    push_meeting_update: bool | None = None
    email_parent_link: bool | None = None
    email_purchase_approval: bool | None = None
    email_child_weekly_summary: bool | None = None
    email_meeting_update: bool | None = None
    whatsapp_parent_link: bool | None = None
    whatsapp_purchase_approval: bool | None = None
    whatsapp_child_weekly_summary: bool | None = None
    whatsapp_meeting_update: bool | None = None
