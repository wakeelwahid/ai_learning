"""
Scheduled notification jobs for the EdTech platform.

Schedule summary (all times UTC → IST conversion noted):
  - send_morning_goal_reminder      : daily  02:30 UTC  (8:00 AM IST)  — "Today's Goal"
  - send_afternoon_friend_activity  : daily  07:30 UTC  (1:00 PM IST)  — "Friend Activity"
  - send_streak_reminder_primary    : daily  12:30 UTC  (6:00 PM IST)  — "Evening" streak nudge
  - send_streak_reminder_secondary  : daily  14:30 UTC  (8:00 PM IST)
  - send_night_revision_reminder    : daily  15:30 UTC  (9:00 PM IST)  — "Revision Reminder"
  - send_battle_reminders           : every 1 minute — "Battle Reminder" (polls battle_service)
  - send_weekly_student_report      : Sunday 13:30 UTC  (7:00 PM IST Sunday)
  - send_parent_weekly_summary      : Monday 02:30 UTC  (8:00 AM IST Monday)
  - send_winback_notifications      : daily  09:30 UTC  (3:00 PM IST)  — dormant users, 3/7/30-day tiers
  - deliver_due_nudges              : every 15 minutes — delivers ScheduledNudge rows past their fire_at
                                       (e.g. weak-topic practice nudges queued by quiz_service)

Every job creates a durable `Notification` row (the in-app feed's source of
truth) and then best-effort enqueues a `send_push_task` via Celery/RabbitMQ
if — and only if — the user has a registered push device token. A missing
token, an unreachable broker, or a downstream service being briefly down
never blocks or fails the job — the in-app row always lands.
"""
from __future__ import annotations

import functools
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Callable

import httpx
import pytz
import redis.asyncio as aioredis
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.notification import (
    Notification,
    NotificationPreference,
    NotificationStatus,
    NotificationType,
    ScheduledNudge,
)
from app.tasks.notifications import send_push_task

logger = logging.getLogger(__name__)

IST = pytz.timezone("Asia/Kolkata")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def create_notification(
    session: AsyncSession,
    user_id: uuid.UUID,
    notif_type: str,
    channel: str,
    priority: str,
    title: str,
    body: str,
) -> Notification:
    """Persist a single Notification row and return it (not yet committed)."""
    channel_map = {
        "push": NotificationType.PUSH,
        "email": NotificationType.EMAIL,
        "whatsapp": NotificationType.WHATSAPP,
        "in_app": NotificationType.IN_APP,
    }
    notif_type_enum = channel_map.get(channel, NotificationType.PUSH)

    notif = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        type=notif_type_enum,
        title=title,
        body=body,
        status=NotificationStatus.PENDING,
        template=notif_type,
    )
    session.add(notif)
    return notif


async def enqueue_push_if_token(session: AsyncSession, notif: Notification) -> None:
    """Best-effort: if the user has a registered device token, enqueue real
    push delivery via Celery/RabbitMQ (the queue path this service's worker
    container consumes). No-ops silently otherwise — the Notification row
    written by create_notification is already the durable, authoritative
    record the in-app feed reads."""
    try:
        result = await session.execute(
            text("SELECT token FROM push_tokens WHERE user_id = :uid LIMIT 1"),
            {"uid": str(notif.user_id)},
        )
        row = result.first()
        if not row:
            return
        send_push_task.delay(str(notif.id), row[0], notif.title, notif.body)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to enqueue push for notification %s: %s", notif.id, exc)


async def trigger_goal_generation() -> None:
    """Best-effort call to gamification_service to pre-generate today's
    personalized UserDailyGoal for every active user, before the per-user
    morning loop below reads them. If this fails, get_or_create_today()'s
    lazy-creation fallback still covers each user individually."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/goals/admin/generate-today",
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        pass


async def fetch_user_goals(user_id: uuid.UUID) -> list[dict]:
    """Best-effort call to gamification_service for this user's today's goal
    SET (up to 3 — one per slot: video/quiz/ai_doubt; see the v2 Daily Goal
    System). Returns [] on any failure or if the feature is disabled — the
    caller falls back to generic copy."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/goals/internal/today/{user_id}",
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code == 200:
            return resp.json() or []
    except Exception:
        pass
    return []


def _pick_reminder_goal(goals: list[dict]) -> dict | None:
    """The single most relevant goal for a push notification's one-line
    copy — the first still-incomplete one (in slot order: video, quiz,
    ai_doubt), or the first goal at all if every slot is already done."""
    for g in goals:
        if not g.get("completed"):
            return g
    return goals[0] if goals else None


async def fetch_friend_activity_blurb(user_id: uuid.UUID) -> str | None:
    """Best-effort call to gamification_service for this user's most recent
    friend activity (within the last 18h), formatted as a short notification
    body. Returns None if there's nothing new or the service is unreachable."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/activity/internal/friends/{user_id}",
                params={"limit": 1},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code != 200:
            return None
        items = resp.json()
        if not items:
            return None
        item = items[0]
        created_at = datetime.fromisoformat(item["created_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) - created_at > timedelta(hours=18):
            return None
        name = item.get("user_name") or "A friend"
        atype = item.get("activity_type")
        if atype == "quiz_completed" and item.get("score_pct") is not None:
            return f"{name} scored {item['score_pct']}% in {item.get('title', 'a quiz')}"
        if atype == "battle_won":
            return f"{name} won a Battle!"
        if atype == "level_up":
            return f"{name} reached {item.get('title', 'a new level')}"
        if atype == "badge_earned":
            return f"{name} earned the {item.get('title', 'a')} badge"
        return None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Job implementations
# ---------------------------------------------------------------------------

async def send_morning_goal_reminder(db_factory: Callable) -> None:
    """Daily at 02:30 UTC (8:00 AM IST). "Today's Goal" — the Daily Goal
    System (see gamification_service) auto-generates a personalized goal
    per active user; this job pre-generates them for everyone, then notifies
    each eligible user with their own goal's title."""
    try:
        await trigger_goal_generation()

        async with db_factory() as session:
            try:
                today = date.today()
                rows = await session.execute(
                    text(
                        """
                        SELECT DISTINCT np.user_id
                        FROM   notification_preferences np
                        WHERE  np.in_app_daily_goal_reminder = TRUE
                          AND  NOT EXISTS (
                                SELECT 1 FROM notifications n2
                                WHERE  n2.user_id  = np.user_id
                                  AND  n2.template = 'daily_goal_reminder'
                                  AND  DATE(n2.created_at AT TIME ZONE 'UTC') = :today
                          )
                        """
                    ),
                    {"today": today},
                )
                user_ids = [row[0] for row in rows]

                count = 0
                for uid in user_ids:
                    goals = await fetch_user_goals(uid)
                    goal = _pick_reminder_goal(goals)
                    if goal:
                        total_xp = sum(g.get("xp_reward", 0) for g in goals)
                        body = (
                            f"{goal['title']} to earn {goal['xp_reward']} XP!"
                            if len(goals) <= 1
                            else f"{len(goals)} goals today, up to {total_xp} XP — start with: {goal['title']}"
                        )
                    else:
                        body = "Set your goals for today and start earning XP!"
                    notif = await create_notification(
                        session=session, user_id=uid, notif_type="daily_goal_reminder",
                        channel="push", priority="normal", title="🎯 Today's Goals", body=body,
                    )
                    await session.flush()
                    await enqueue_push_if_token(session, notif)
                    count += 1

                await session.commit()
                logger.info("send_morning_goal_reminder: created %d notifications for %s", count, today)
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                logger.warning("send_morning_goal_reminder: DB query failed (%s).", exc)
    except Exception as exc:  # noqa: BLE001
        logger.error("send_morning_goal_reminder: session factory error: %s", exc)


async def send_afternoon_friend_activity(db_factory: Callable) -> None:
    """Daily at 07:30 UTC (1:00 PM IST). "Friend Activity" — notifies a user
    about their most notable friend's recent achievement, if any (e.g.
    "Rahul scored 95% in Biology Quiz")."""
    try:
        async with db_factory() as session:
            try:
                today = date.today()
                rows = await session.execute(
                    text(
                        """
                        SELECT DISTINCT np.user_id
                        FROM   notification_preferences np
                        WHERE  np.in_app_friend_activity = TRUE
                          AND  NOT EXISTS (
                                SELECT 1 FROM notifications n2
                                WHERE  n2.user_id  = np.user_id
                                  AND  n2.template = 'friend_activity'
                                  AND  DATE(n2.created_at AT TIME ZONE 'UTC') = :today
                          )
                        """
                    ),
                    {"today": today},
                )
                user_ids = [row[0] for row in rows]

                count = 0
                for uid in user_ids:
                    blurb = await fetch_friend_activity_blurb(uid)
                    if not blurb:
                        continue
                    notif = await create_notification(
                        session=session, user_id=uid, notif_type="friend_activity",
                        channel="push", priority="normal", title="👀 " + blurb,
                        body="Tap to see the leaderboard.",
                    )
                    await session.flush()
                    await enqueue_push_if_token(session, notif)
                    count += 1

                await session.commit()
                logger.info("send_afternoon_friend_activity: created %d notifications for %s", count, today)
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                logger.warning("send_afternoon_friend_activity: DB query failed (%s).", exc)
    except Exception as exc:  # noqa: BLE001
        logger.error("send_afternoon_friend_activity: session factory error: %s", exc)


async def send_streak_reminder_primary(db_factory: Callable) -> None:
    """
    Daily at 12:30 UTC (6:00 PM IST) — the "Evening" slot.
    Notify students who have an active streak but have not studied today.
    """
    try:
        async with db_factory() as session:
            try:
                today = date.today()
                rows = await session.execute(
                    text(
                        """
                        SELECT DISTINCT np.user_id
                        FROM   notification_preferences np
                        WHERE  np.in_app_streak_reminder = TRUE
                          AND  NOT EXISTS (
                                SELECT 1 FROM notifications n2
                                WHERE  n2.user_id  = np.user_id
                                  AND  n2.template = 'streak_reminder'
                                  AND  DATE(n2.created_at AT TIME ZONE 'UTC') = :today
                          )
                        """
                    ),
                    {"today": today},
                )
                user_ids = [row[0] for row in rows]

                count = 0
                for uid in user_ids:
                    # Progress-aware copy: if today's goal set has an
                    # incomplete slot, name exactly what's left (matches the
                    # Daily Goal System's evening-reminder spec); otherwise
                    # fall back to the original streak-preservation framing.
                    # An "almost there" nudge when only ONE slot remains is a
                    # deliberate FOMO trigger — see the engagement design.
                    goals = await fetch_user_goals(uid)
                    goal = _pick_reminder_goal(goals)
                    remaining_slots = sum(1 for g in goals if not g.get("completed"))
                    if goal and not goal.get("completed"):
                        remaining = max(1, goal["target_count"] - goal["progress"])
                        noun = {"quiz": "quiz", "quizzes": "quiz"}.get(goal["goal_type"], goal["goal_type"].replace("_", " "))
                        if remaining_slots == 1:
                            body = f"Just 1 goal left — complete {remaining} more {noun} to finish today's set!"
                        else:
                            body = f"Complete {remaining} more {noun} to finish today's goal!"
                    else:
                        body = "You are one quiz away from your streak."

                    notif = await create_notification(
                        session=session, user_id=uid, notif_type="streak_reminder",
                        channel="push", priority="high",
                        title="🔥 Don't lose your streak",
                        body=body,
                    )
                    await session.flush()
                    await enqueue_push_if_token(session, notif)
                    count += 1

                await session.commit()
                logger.info("send_streak_reminder_primary: created %d notifications for %s", count, today)
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                logger.warning(
                    "send_streak_reminder_primary: DB query failed (%s). "
                    "Scheduler job ran but produced 0 notifications.",
                    exc,
                )
    except Exception as exc:  # noqa: BLE001
        logger.error("send_streak_reminder_primary: session factory error: %s", exc)


async def send_streak_reminder_secondary(db_factory: Callable) -> None:
    """
    Daily at 14:30 UTC (8:00 PM IST).
    Follow-up reminder for users who still haven't studied after the primary nudge.
    Uses a softer tone.
    """
    try:
        async with db_factory() as session:
            try:
                today = date.today()
                rows = await session.execute(
                    text(
                        """
                        SELECT DISTINCT np.user_id
                        FROM   notification_preferences np
                        WHERE  np.in_app_streak_reminder = TRUE
                          AND  NOT EXISTS (
                                SELECT 1 FROM notifications n2
                                WHERE  n2.user_id  = np.user_id
                                  AND  n2.template = 'streak_reminder'
                                  AND  DATE(n2.created_at AT TIME ZONE 'UTC') = :today
                                  AND  n2.status   = 'sent'
                          )
                        """
                    ),
                    {"today": today},
                )
                user_ids = [row[0] for row in rows]

                count = 0
                for uid in user_ids:
                    notif = await create_notification(
                        session=session, user_id=uid, notif_type="streak_reminder",
                        channel="push", priority="high",
                        title="Just 5 minutes is enough",
                        body="Your streak is waiting. Open the app and study anything!",
                    )
                    await session.flush()
                    await enqueue_push_if_token(session, notif)
                    count += 1

                await session.commit()
                logger.info("send_streak_reminder_secondary: created %d notifications for %s", count, today)
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                logger.warning(
                    "send_streak_reminder_secondary: DB query failed (%s). "
                    "Scheduler job ran but produced 0 notifications.",
                    exc,
                )
    except Exception as exc:  # noqa: BLE001
        logger.error("send_streak_reminder_secondary: session factory error: %s", exc)


async def send_night_revision_reminder(db_factory: Callable) -> None:
    """Daily at 15:30 UTC (9:00 PM IST). "Revision Reminder" — a generic
    nudge to revise the day's material before bed."""
    try:
        async with db_factory() as session:
            try:
                today = date.today()
                rows = await session.execute(
                    text(
                        """
                        SELECT DISTINCT np.user_id
                        FROM   notification_preferences np
                        WHERE  np.in_app_revision_reminder = TRUE
                          AND  NOT EXISTS (
                                SELECT 1 FROM notifications n2
                                WHERE  n2.user_id  = np.user_id
                                  AND  n2.template = 'revision_reminder'
                                  AND  DATE(n2.created_at AT TIME ZONE 'UTC') = :today
                          )
                        """
                    ),
                    {"today": today},
                )
                user_ids = [row[0] for row in rows]

                count = 0
                for uid in user_ids:
                    notif = await create_notification(
                        session=session, user_id=uid, notif_type="revision_reminder",
                        channel="push", priority="normal",
                        title="📚 Revision time",
                        body="Revise today's chapter to stay ahead!",
                    )
                    await session.flush()
                    await enqueue_push_if_token(session, notif)
                    count += 1

                await session.commit()
                logger.info("send_night_revision_reminder: created %d notifications for %s", count, today)
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                logger.warning("send_night_revision_reminder: DB query failed (%s).", exc)
    except Exception as exc:  # noqa: BLE001
        logger.error("send_night_revision_reminder: session factory error: %s", exc)


async def send_battle_reminders(db_factory: Callable) -> None:
    """Every 1 minute. "Battle Reminder" — polls battle_service for battles
    scheduled to start within the next ~10 minutes (lead time is admin-
    configurable via gamification_service's engagement config;
    battle_service defaults to 10 if not overridden per-call) and notifies
    every joined participant. battle_service itself marks each battle as
    reminded atomically, so repeated 1-minute polls never double-notify."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.BATTLE_SERVICE_URL}/api/v1/battles/starting-soon",
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code != 200:
            return
        battles = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("send_battle_reminders: battle_service unreachable: %s", exc)
        return

    if not battles:
        return

    try:
        async with db_factory() as session:
            try:
                count = 0
                for b in battles:
                    subject = b.get("subject") or b.get("battle_type", "battle").replace("_", " ").title()
                    for uid_str in b.get("participant_user_ids", []):
                        try:
                            uid = uuid.UUID(uid_str)
                        except ValueError:
                            continue
                        # Reuses the existing "battle_invite" preference — a
                        # dedicated toggle wasn't added for this one new type
                        # (see ENGAGEMENT_CONFIG_DEFAULTS note on scope) since
                        # it's the closest existing "battle-related push" opt-in.
                        pref = await session.execute(
                            text("SELECT in_app_battle_invite FROM notification_preferences WHERE user_id = :uid"),
                            {"uid": str(uid)},
                        )
                        row = pref.first()
                        if row is not None and row[0] is False:
                            continue
                        notif = await create_notification(
                            session=session, user_id=uid, notif_type="battle_reminder",
                            channel="push", priority="high",
                            title="⚔️ Battle starting soon",
                            body=f"Your {subject} battle starts in a few minutes. Get ready!",
                        )
                        await session.flush()
                        await enqueue_push_if_token(session, notif)
                        count += 1
                await session.commit()
                logger.info("send_battle_reminders: created %d notifications for %d battles", count, len(battles))
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                logger.warning("send_battle_reminders: DB write failed (%s).", exc)
    except Exception as exc:  # noqa: BLE001
        logger.error("send_battle_reminders: session factory error: %s", exc)


async def send_weekly_student_report(db_factory: Callable) -> None:
    """
    Every Sunday at 13:30 UTC (7:00 PM IST Sunday).
    Notify students who have been active in the last 7 days about their weekly report.
    """
    try:
        async with db_factory() as session:
            try:
                rows = await session.execute(
                    text(
                        """
                        SELECT DISTINCT user_id
                        FROM   notifications
                        WHERE  created_at >= NOW() - INTERVAL '7 days'
                          AND  status IN ('sent', 'pending')
                        """
                    )
                )
                user_ids = [row[0] for row in rows]

                count = 0
                for uid in user_ids:
                    notif = await create_notification(
                        session=session, user_id=uid, notif_type="weekly_report",
                        channel="push", priority="normal",
                        title="Your weekly report is ready!",
                        body="See how you performed this week in EduLearn.",
                    )
                    await session.flush()
                    await enqueue_push_if_token(session, notif)
                    count += 1

                await session.commit()
                logger.info(
                    "send_weekly_student_report: created %d notifications (week ending %s)",
                    count,
                    date.today(),
                )
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                logger.warning(
                    "send_weekly_student_report: DB query failed (%s). "
                    "Scheduler job ran but produced 0 notifications.",
                    exc,
                )
    except Exception as exc:  # noqa: BLE001
        logger.error("send_weekly_student_report: session factory error: %s", exc)


WINBACK_TIER_COPY: dict[int, tuple[str, str]] = {
    3:  ("Your streak is waiting 🔥", "It's been 3 days — come back and pick up where you left off."),
    7:  ("We miss you at EduLearn 👋", "A week's gone by. Your friends are still climbing the leaderboard — jump back in!"),
    30: ("Come back — there's a lot new 🎉", "It's been a month. New chapters, challenges, and rewards are waiting for you."),
}


async def send_winback_notifications(db_factory: Callable) -> None:
    """
    Daily 09:30 UTC (3:00 PM IST) — dormant-user re-engagement, the one
    tier this scheduler was missing: every other job here targets ACTIVE
    users (streak/goal/weekly-report reminders). This targets users who
    stopped logging in, at 3/7/30-day tiers.

    auth_service's /internal/dormant-users returns users whose last_login
    falls in an EXACT one-day-wide window around N days ago (not "at least
    N days") — so a user is only ever matched by one tier, once, the day
    their dormancy crosses that exact threshold. No additional dedup query
    is needed here for that reason (unlike the streak reminder, which reuses
    the same day-boundary check every day for users who remain active).
    """
    for tier_days, (title, body) in WINBACK_TIER_COPY.items():
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{settings.AUTH_SERVICE_URL}/api/v1/auth/internal/dormant-users",
                    params={"inactive_days": tier_days},
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
            if resp.status_code != 200:
                logger.warning("send_winback_notifications: tier %d — auth_service returned %d", tier_days, resp.status_code)
                continue
            dormant_users = resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning("send_winback_notifications: tier %d — auth_service call failed: %s", tier_days, exc)
            continue

        if not dormant_users:
            continue

        try:
            async with db_factory() as session:
                try:
                    count = 0
                    for u in dormant_users:
                        notif = await create_notification(
                            session=session, user_id=uuid.UUID(u["user_id"]),
                            notif_type=f"winback_{tier_days}d",
                            channel="push", priority="normal",
                            title=title, body=body,
                        )
                        await session.flush()
                        await enqueue_push_if_token(session, notif)
                        count += 1
                    await session.commit()
                    logger.info("send_winback_notifications: tier %d — created %d notifications", tier_days, count)
                except Exception as exc:  # noqa: BLE001
                    await session.rollback()
                    logger.warning("send_winback_notifications: tier %d — DB write failed: %s", tier_days, exc)
        except Exception as exc:  # noqa: BLE001
            logger.error("send_winback_notifications: tier %d — session factory error: %s", tier_days, exc)


async def deliver_due_nudges(db_factory: Callable) -> None:
    """
    Every 15 minutes — deliver any ScheduledNudge whose fire_at has passed
    (e.g. a weak-topic practice nudge quiz_service queued a few hours
    earlier via /internal/schedule-nudge). Turns each into a real
    Notification exactly once (is_delivered flips under the same
    transaction as the Notification insert, so a crash between the two
    can duplicate-send on retry but never silently drop a nudge — the
    same trade-off the rest of this scheduler already makes).
    """
    try:
        async with db_factory() as session:
            try:
                now = datetime.now(timezone.utc)
                rows = await session.execute(
                    select(ScheduledNudge).where(
                        ScheduledNudge.is_delivered.is_(False),
                        ScheduledNudge.fire_at <= now,
                    ).limit(500)
                )
                nudges = list(rows.scalars())

                count = 0
                for nudge in nudges:
                    # Respect the opt-out toggle for weak-topic nudges
                    # specifically; other nudge_types default to allowed
                    # (this job is currently only used for that one type,
                    # but the check is scoped so a future nudge_type
                    # doesn't silently inherit an unrelated preference).
                    if nudge.nudge_type == "weak_topic_practice":
                        pref_row = await session.execute(
                            text("SELECT in_app_weak_topic_nudge FROM notification_preferences WHERE user_id = :uid"),
                            {"uid": str(nudge.user_id)},
                        )
                        pref = pref_row.first()
                        if pref is not None and pref[0] is False:
                            nudge.is_delivered = True  # opted out — mark handled, don't re-check forever
                            continue
                    notif = await create_notification(
                        session=session, user_id=nudge.user_id,
                        notif_type=nudge.nudge_type,
                        channel="push", priority="normal",
                        title=nudge.title, body=nudge.body,
                    )
                    await session.flush()
                    await enqueue_push_if_token(session, notif)
                    nudge.is_delivered = True
                    count += 1

                await session.commit()
                if count:
                    logger.info("deliver_due_nudges: delivered %d nudges", count)
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                logger.warning("deliver_due_nudges: DB operation failed: %s", exc)
    except Exception as exc:  # noqa: BLE001
        logger.error("deliver_due_nudges: session factory error: %s", exc)


async def send_parent_weekly_summary(db_factory: Callable) -> None:
    """
    Every Monday at 02:30 UTC (8:00 AM IST Monday).
    Notify parents who have linked student accounts about their child's weekly summary.
    """
    try:
        async with db_factory() as session:
            try:
                # Parents are those with at least one APPROVED child link —
                # owned by user_service (separate DB), so ask it. The old
                # heuristic (anyone who had ever sent a message as
                # role=parent) missed linked parents who never messaged and
                # kept notifying unlinked ex-parents.
                user_ids: list[uuid.UUID] = []
                try:
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        resp = await client.get(
                            f"{settings.USER_SERVICE_URL}/api/v1/users/internal/parent-links/approved-parents",
                            headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                        )
                        resp.raise_for_status()
                        user_ids = [uuid.UUID(i) for i in resp.json().get("parent_ids", [])]
                except Exception as exc:  # noqa: BLE001
                    logger.warning("send_parent_weekly_summary: could not fetch approved parents: %s", exc)

                count = 0
                for uid in user_ids:
                    pref_row = await session.execute(
                        select(
                            NotificationPreference.in_app_child_weekly_summary,
                            NotificationPreference.push_child_weekly_summary,
                        ).where(NotificationPreference.user_id == uid)
                    )
                    pref = pref_row.first()
                    in_app_on = pref is None or pref[0] is not False
                    push_on = pref is None or pref[1] is not False
                    if not in_app_on:
                        continue
                    notif = await create_notification(
                        session=session, user_id=uid, notif_type="parent_weekly_summary",
                        channel="push", priority="normal",
                        title="Your child's weekly summary is ready",
                        body="Check your child's learning progress this week.",
                    )
                    await session.flush()
                    if push_on:
                        await enqueue_push_if_token(session, notif)
                    count += 1

                await session.commit()
                logger.info(
                    "send_parent_weekly_summary: created %d notifications (week ending %s)",
                    count,
                    date.today(),
                )
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                logger.warning(
                    "send_parent_weekly_summary: DB query failed (%s). "
                    "Scheduler job ran but produced 0 notifications.",
                    exc,
                )
    except Exception as exc:  # noqa: BLE001
        logger.error("send_parent_weekly_summary: session factory error: %s", exc)


# ---------------------------------------------------------------------------
# Scheduler factory
# ---------------------------------------------------------------------------

# Scheduler HA: today's only protection against double-firing every job is
# the operational convention of running exactly one `notification_scheduler`
# replica (see scheduler_main.py's docstring). If that container is ever
# scaled to 2+, APScheduler's in-memory AsyncIOScheduler has no leader
# election of its own — every replica would independently fire every
# cron/interval job at the same tick. This wraps each job function in a
# Redis SETNX claim keyed by (job_id, scheduled tick), so only the first
# replica to claim a given tick actually runs the job body; every other
# replica's call becomes a no-op. TTL covers the claim window only — long
# enough for one replica to finish, short enough not to block the NEXT
# scheduled tick of a frequent job (the 1-minute battle-reminder poll).
_LOCK_TTL_SECONDS = 45
_redis_lock_client: aioredis.Redis | None = None


def _get_lock_client() -> aioredis.Redis:
    global _redis_lock_client
    if _redis_lock_client is None:
        _redis_lock_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_lock_client


def with_scheduler_lock(job_id: str, func: Callable) -> Callable:
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        # APScheduler doesn't pass the trigger's fire time into kwargs, so we
        # key on a coarse wall-clock tick instead — good enough to dedupe two
        # replicas firing "the same" scheduled run within the same minute,
        # without needing to thread APScheduler internals through here.
        tick = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
        lock_key = f"scheduler:lock:{job_id}:{tick}"
        try:
            client = _get_lock_client()
            claimed = await client.set(lock_key, "1", nx=True, ex=_LOCK_TTL_SECONDS)
        except Exception as exc:
            # Fail OPEN on a Redis outage — a missed notification job is a
            # much better failure mode than every scheduler replica refusing
            # to run anything because the lock backend is unreachable.
            logger.warning("Scheduler lock check failed for %s (%s) — running anyway", job_id, exc)
            claimed = True
        if not claimed:
            logger.info("Scheduler lock already held for %s at tick %s — skipping", job_id, tick)
            return
        return await func(*args, **kwargs)
    return wrapper


def init_scheduler(db_factory: Callable) -> AsyncIOScheduler:
    """
    Build and configure the APScheduler instance.

    The scheduler is returned but NOT started here — the lifespan manager in
    main.py is responsible for calling scheduler.start() and scheduler.shutdown().

    Args:
        db_factory: A zero-argument async context manager that yields an
                    AsyncSession (e.g. ``AsyncSessionLocal``).

    Returns:
        A configured (but not yet started) AsyncIOScheduler.
    """
    scheduler = AsyncIOScheduler(timezone="UTC")

    # --- 1. Morning goal reminder: daily 02:30 UTC (8:00 AM IST) ------------
    scheduler.add_job(
        func=with_scheduler_lock("morning_goal_reminder", send_morning_goal_reminder),
        trigger=CronTrigger(hour=2, minute=30, timezone="UTC"),
        id="morning_goal_reminder",
        name="Morning Goal Reminder (02:30 UTC / 8 AM IST)",
        kwargs={"db_factory": db_factory},
        replace_existing=True,
        misfire_grace_time=300,
        coalesce=True,
    )

    # --- 2. Afternoon friend activity: daily 07:30 UTC (1:00 PM IST) --------
    scheduler.add_job(
        func=with_scheduler_lock("afternoon_friend_activity", send_afternoon_friend_activity),
        trigger=CronTrigger(hour=7, minute=30, timezone="UTC"),
        id="afternoon_friend_activity",
        name="Afternoon Friend Activity (07:30 UTC / 1 PM IST)",
        kwargs={"db_factory": db_factory},
        replace_existing=True,
        misfire_grace_time=300,
        coalesce=True,
    )

    # --- 3. Primary streak reminder ("Evening"): daily 12:30 UTC (6 PM IST) -
    scheduler.add_job(
        func=with_scheduler_lock("streak_reminder_primary", send_streak_reminder_primary),
        trigger=CronTrigger(hour=12, minute=30, timezone="UTC"),
        id="streak_reminder_primary",
        name="Streak Reminder — Primary / Evening (12:30 UTC / 6 PM IST)",
        kwargs={"db_factory": db_factory},
        replace_existing=True,
        misfire_grace_time=300,  # 5-minute grace window
        coalesce=True,
    )

    # --- 4. Secondary streak reminder: daily 14:30 UTC (8:00 PM IST) --------
    scheduler.add_job(
        func=with_scheduler_lock("streak_reminder_secondary", send_streak_reminder_secondary),
        trigger=CronTrigger(hour=14, minute=30, timezone="UTC"),
        id="streak_reminder_secondary",
        name="Streak Reminder — Secondary (14:30 UTC / 8 PM IST)",
        kwargs={"db_factory": db_factory},
        replace_existing=True,
        misfire_grace_time=300,
        coalesce=True,
    )

    # --- 5. Night revision reminder: daily 15:30 UTC (9:00 PM IST) ----------
    scheduler.add_job(
        func=with_scheduler_lock("night_revision_reminder", send_night_revision_reminder),
        trigger=CronTrigger(hour=15, minute=30, timezone="UTC"),
        id="night_revision_reminder",
        name="Night Revision Reminder (15:30 UTC / 9 PM IST)",
        kwargs={"db_factory": db_factory},
        replace_existing=True,
        misfire_grace_time=300,
        coalesce=True,
    )

    # --- 5b. Battle Reminder: every 1 minute ---------------------------------
    scheduler.add_job(
        func=with_scheduler_lock("battle_reminders", send_battle_reminders),
        trigger=IntervalTrigger(minutes=1),
        id="battle_reminders",
        name="Battle Reminder (every 1 minute)",
        kwargs={"db_factory": db_factory},
        replace_existing=True,
        misfire_grace_time=30,
        coalesce=True,
        max_instances=1,
    )

    # --- 6. Weekly student report: every Sunday 13:30 UTC (7 PM IST) --------
    scheduler.add_job(
        func=with_scheduler_lock("weekly_student_report", send_weekly_student_report),
        trigger=CronTrigger(day_of_week="sun", hour=13, minute=30, timezone="UTC"),
        id="weekly_student_report",
        name="Weekly Student Report (Sunday 13:30 UTC / 7 PM IST)",
        kwargs={"db_factory": db_factory},
        replace_existing=True,
        misfire_grace_time=600,
        coalesce=True,
    )

    # --- 7. Parent weekly summary: every Monday 02:30 UTC (8 AM IST) --------
    scheduler.add_job(
        func=with_scheduler_lock("parent_weekly_summary", send_parent_weekly_summary),
        trigger=CronTrigger(day_of_week="mon", hour=2, minute=30, timezone="UTC"),
        id="parent_weekly_summary",
        name="Parent Weekly Summary (Monday 02:30 UTC / 8 AM IST)",
        kwargs={"db_factory": db_factory},
        replace_existing=True,
        misfire_grace_time=600,
        coalesce=True,
    )

    # --- 8. Win-back: dormant users at 3/7/30-day tiers, daily 09:30 UTC (3 PM IST) ---
    scheduler.add_job(
        func=with_scheduler_lock("winback_notifications", send_winback_notifications),
        trigger=CronTrigger(hour=9, minute=30, timezone="UTC"),
        id="winback_notifications",
        name="Win-back — Dormant Users 3/7/30d (09:30 UTC / 3 PM IST)",
        kwargs={"db_factory": db_factory},
        replace_existing=True,
        misfire_grace_time=600,
        coalesce=True,
    )

    # --- 9. Deliver due nudges (e.g. weak-topic practice), every 15 minutes ---
    scheduler.add_job(
        func=with_scheduler_lock("deliver_due_nudges", deliver_due_nudges),
        trigger=IntervalTrigger(minutes=15),
        id="deliver_due_nudges",
        name="Deliver Due Nudges (every 15 min)",
        kwargs={"db_factory": db_factory},
        replace_existing=True,
        misfire_grace_time=300,
        coalesce=True,
    )

    logger.info(
        "Scheduler configured with %d jobs: %s",
        len(scheduler.get_jobs()),
        [j.id for j in scheduler.get_jobs()],
    )
    return scheduler
