import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, unique=True)
    # Per-channel toggles per event type
    in_app_new_video: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_quiz_result: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_battle_invite: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_streak_reminder: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_badge_unlocked: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_promotional: Mapped[bool] = mapped_column(Boolean, default=False)
    email_new_video: Mapped[bool] = mapped_column(Boolean, default=True)
    email_quiz_result: Mapped[bool] = mapped_column(Boolean, default=True)
    email_battle_invite: Mapped[bool] = mapped_column(Boolean, default=False)
    email_streak_reminder: Mapped[bool] = mapped_column(Boolean, default=True)
    email_badge_unlocked: Mapped[bool] = mapped_column(Boolean, default=True)
    email_promotional: Mapped[bool] = mapped_column(Boolean, default=False)
    whatsapp_new_video: Mapped[bool] = mapped_column(Boolean, default=False)
    whatsapp_quiz_result: Mapped[bool] = mapped_column(Boolean, default=False)
    whatsapp_battle_invite: Mapped[bool] = mapped_column(Boolean, default=False)
    whatsapp_streak_reminder: Mapped[bool] = mapped_column(Boolean, default=True)
    whatsapp_badge_unlocked: Mapped[bool] = mapped_column(Boolean, default=False)
    whatsapp_promotional: Mapped[bool] = mapped_column(Boolean, default=False)
    # In-app-only reminder categories (morning/afternoon/night schedule) —
    # these are transient, time-sensitive nudges, not the kind of content
    # anyone wants duplicated over email/WhatsApp, so unlike the categories
    # above they get a single toggle rather than a channel per toggle.
    in_app_daily_goal_reminder: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_friend_activity: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_revision_reminder: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_weak_topic_nudge: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_parent_link: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    in_app_purchase_approval: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    in_app_child_weekly_summary: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    in_app_meeting_update: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    push_parent_link: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    push_purchase_approval: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    push_child_weekly_summary: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    push_meeting_update: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    email_parent_link: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    email_purchase_approval: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    email_child_weekly_summary: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    email_meeting_update: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    whatsapp_parent_link: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    whatsapp_purchase_approval: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    whatsapp_child_weekly_summary: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    whatsapp_meeting_update: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


PARENT_EVENT_KEYS = ("parent_link", "purchase_approval", "child_weekly_summary", "meeting_update")
PREFERENCE_EVENT_KEYS = (
    "new_video", "quiz_result", "battle_invite", "streak_reminder", "badge_unlocked", "promotional",
    "daily_goal_reminder", "friend_activity", "revision_reminder", "weak_topic_nudge",
    *PARENT_EVENT_KEYS,
)


class NotificationType(str, enum.Enum):
    EMAIL = "email"
    WHATSAPP = "whatsapp"
    PUSH = "push"
    IN_APP = "in_app"


class NotificationStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    READ = "read"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(Enum(NotificationStatus), default=NotificationStatus.PENDING)
    template: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ScheduledNudge(Base):
    """A queued, not-yet-delivered nudge — e.g. "practice this weak topic,"
    queued right after a quiz submission but deliberately delivered later
    (same day/next day, per product decision) rather than immediately,
    since a nudge fired the second the quiz ends reads as nagging, not
    coaching. A scheduler job (see schedulers/weak_topic_nudges.py) polls
    for rows whose fire_at has passed and turns each into a real
    Notification row exactly once."""
    __tablename__ = "scheduled_nudges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    nudge_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'weak_topic_practice'
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    fire_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    is_delivered: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
