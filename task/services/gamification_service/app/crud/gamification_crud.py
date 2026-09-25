import uuid
from datetime import date, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import (
    ActivityFeedItem,
    ActivityType,
    ClaimStatus,
    DailyChallenge,
    GoalTemplate,
    RewardCalendarDay,
    UserBadge,
    UserChallengeProgress,
    UserDailyGoal,
    UserEduPoints,
    UserStreak,
    UserXP,
    XPTransaction,
    YoutubeSubscribeClaim,
)
from app.models.share_event import ShareEvent


async def get_user_xp(db: AsyncSession, user_id: uuid.UUID) -> UserXP | None:
    result = await db.execute(select(UserXP).where(UserXP.user_id == user_id))
    return result.scalar_one_or_none()


async def get_user_streak(db: AsyncSession, user_id: uuid.UUID) -> UserStreak | None:
    result = await db.execute(select(UserStreak).where(UserStreak.user_id == user_id))
    return result.scalar_one_or_none()


async def get_user_badges(db: AsyncSession, user_id: uuid.UUID) -> list[UserBadge]:
    result = await db.execute(select(UserBadge).where(UserBadge.user_id == user_id))
    return list(result.scalars().all())


async def get_user_edupoints(db: AsyncSession, user_id: uuid.UUID) -> UserEduPoints | None:
    """Read-only balance lookup — unlike EduPointsService.get_balance() this
    never creates the row, so it is safe on a pure-read endpoint."""
    result = await db.execute(select(UserEduPoints).where(UserEduPoints.user_id == user_id))
    return result.scalar_one_or_none()


async def get_recent_daily_goals(db: AsyncSession, user_id: uuid.UUID, days: int) -> list[UserDailyGoal]:
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(UserDailyGoal)
        .where(UserDailyGoal.user_id == user_id, UserDailyGoal.goal_date >= since)
        .order_by(UserDailyGoal.goal_date.desc())
    )
    return list(result.scalars().all())


async def get_recent_xp_transactions(db: AsyncSession, user_id: uuid.UUID, limit: int) -> list[XPTransaction]:
    result = await db.execute(
        select(XPTransaction)
        .where(XPTransaction.user_id == user_id)
        .order_by(XPTransaction.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def count_completed_challenges(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count(UserChallengeProgress.id)).where(
            UserChallengeProgress.user_id == user_id,
            UserChallengeProgress.completed.is_(True),
        )
    )
    return result.scalar_one()


async def get_leaderboard(db: AsyncSession, limit: int = 10) -> list[UserXP]:
    """Query leaderboard_mv (materialized view, refreshed every 5 min).
    Falls back to the live table if the view doesn't exist yet."""
    try:
        rows = (await db.execute(
            text("SELECT user_id, total_xp, level FROM leaderboard_mv ORDER BY rank LIMIT :lim"),
            {"lim": limit},
        )).mappings().all()
        # Return as UserXP-like objects the route can consume via .user_id / .total_xp / .level
        return [LeaderboardRow(r["user_id"], r["total_xp"], r["level"]) for r in rows]
    except Exception:
        result = await db.execute(
            select(UserXP).order_by(UserXP.total_xp.desc()).limit(limit)
        )
        return list(result.scalars().all())


async def get_xp_transaction_by_reference(
    db: AsyncSession, user_id: uuid.UUID, event, reference_id: str
):
    """Idempotency check for internal_challenge_result(): a CHALLENGE_WIN
    XPTransaction already recorded for this (winner, reference_id) means the
    battle was already settled."""
    result = await db.execute(
        select(XPTransaction.id).where(
            XPTransaction.user_id == user_id,
            XPTransaction.event == event,
            XPTransaction.reference_id == reference_id,
        ).limit(1)
    )
    return result.scalar_one_or_none()


async def get_challenge_by_date(db: AsyncSession, challenge_date: date) -> DailyChallenge | None:
    """Fallback lookup used when create_challenge() hits the unique
    constraint on challenge_date (a challenge for that day already exists)."""
    result = await db.execute(select(DailyChallenge).where(DailyChallenge.challenge_date == challenge_date))
    return result.scalar_one_or_none()


async def get_user_rank_row(db: AsyncSession, user_id: uuid.UUID):
    """Direct SQL rank: COUNT(*)+1 users with strictly higher XP. Returns the
    mapping row (with .get-style access via ["rank"]/["total_xp"]/["level"])
    or None if the user has no user_xp row yet."""
    result = await db.execute(
        text("""
            SELECT
                (SELECT COUNT(*) + 1 FROM user_xp ux2 WHERE ux2.total_xp > ux.total_xp) AS rank,
                ux.total_xp, ux.level
            FROM user_xp ux WHERE ux.user_id = :uid
        """),
        {"uid": str(user_id)},
    )
    return result.mappings().first()


async def get_xp_rows_for_users(db: AsyncSession, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, UserXP]:
    result = await db.execute(select(UserXP).where(UserXP.user_id.in_(user_ids)))
    return {row.user_id: row for row in result.scalars().all()}


async def create_share_event(db: AsyncSession, user_id: uuid.UUID, achievement_type: str, platform: str) -> ShareEvent:
    event = ShareEvent(user_id=user_id, achievement_type=achievement_type, platform=platform)
    db.add(event)
    await db.commit()
    return event


# ─── YouTube Subscribe Claims ─────────────────────────────────────────────────

async def get_youtube_claim_by_user(db: AsyncSession, user_id: uuid.UUID) -> YoutubeSubscribeClaim | None:
    result = await db.execute(
        select(YoutubeSubscribeClaim).where(YoutubeSubscribeClaim.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def create_youtube_claim(db: AsyncSession, user_id: uuid.UUID, screenshot_b64: str) -> YoutubeSubscribeClaim:
    claim = YoutubeSubscribeClaim(user_id=user_id, screenshot_b64=screenshot_b64)
    db.add(claim)
    await db.commit()
    await db.refresh(claim)
    return claim


async def get_youtube_claim_by_id(db: AsyncSession, claim_id: uuid.UUID) -> YoutubeSubscribeClaim | None:
    result = await db.execute(
        select(YoutubeSubscribeClaim).where(YoutubeSubscribeClaim.id == claim_id)
    )
    return result.scalar_one_or_none()


async def list_youtube_claims(db: AsyncSession, status: str | None) -> list[YoutubeSubscribeClaim]:
    stmt = select(YoutubeSubscribeClaim).order_by(YoutubeSubscribeClaim.created_at.desc())
    if status:
        stmt = stmt.where(YoutubeSubscribeClaim.status == ClaimStatus(status))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def commit_youtube_claim_review(db: AsyncSession) -> None:
    """Commit an in-place claim-status mutation (approve/reject) made by the
    route directly on an already-fetched YoutubeSubscribeClaim row."""
    await db.commit()


# ─── Friend Activity Feed (admin) ─────────────────────────────────────────────

async def list_activity_feed_admin(
    db: AsyncSession, limit: int, activity_type: ActivityType | None
) -> list[ActivityFeedItem]:
    stmt = select(ActivityFeedItem).order_by(ActivityFeedItem.created_at.desc()).limit(limit)
    if activity_type:
        stmt = stmt.where(ActivityFeedItem.activity_type == activity_type)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_activity_feed_item(db: AsyncSession, item_id: uuid.UUID) -> ActivityFeedItem | None:
    return await db.get(ActivityFeedItem, item_id)


async def delete_activity_feed_item(db: AsyncSession, row: ActivityFeedItem) -> None:
    await db.delete(row)
    await db.commit()


# ─── Daily Rewards admin (reward calendar) ────────────────────────────────────

async def commit_reward_calendar(db: AsyncSession) -> None:
    """Commit calendar rows created by DailyRewardService._calendar()'s
    first-boot seeding fill-in (list endpoint reads + persists the seed)."""
    await db.commit()


async def update_reward_calendar_day(
    db: AsyncSession, row: RewardCalendarDay, xp: int, ep: int, label: str
) -> RewardCalendarDay:
    row.xp = xp
    row.ep = ep
    row.label = label
    await db.commit()
    return row


# ─── Goal Templates admin ─────────────────────────────────────────────────────

async def list_goal_templates(db: AsyncSession) -> list[GoalTemplate]:
    result = await db.execute(select(GoalTemplate).order_by(GoalTemplate.created_at.desc()))
    return list(result.scalars().all())


async def create_goal_template(db: AsyncSession, data: dict) -> GoalTemplate:
    template = GoalTemplate(**data)
    db.add(template)
    await db.flush()
    return template


async def commit_goal_template(db: AsyncSession) -> None:
    await db.commit()


async def get_goal_template(db: AsyncSession, template_id: uuid.UUID) -> GoalTemplate | None:
    return await db.get(GoalTemplate, template_id)


async def update_goal_template(db: AsyncSession, template: GoalTemplate, updates: dict) -> GoalTemplate:
    for field, value in updates.items():
        setattr(template, field, value)
    await db.commit()
    await db.refresh(template)
    return template


async def deactivate_goal_template(db: AsyncSession, template: GoalTemplate) -> None:
    template.is_active = False
    await db.commit()


async def get_goal_completion_analytics(db: AsyncSession, days: int) -> list:
    result = await db.execute(
        text(
            """
            SELECT goal_date,
                   COUNT(*) AS assigned,
                   COUNT(*) FILTER (WHERE completed) AS completed
            FROM   user_daily_goals
            WHERE  goal_date >= CURRENT_DATE - CAST(:days AS integer)
            GROUP BY goal_date
            ORDER BY goal_date DESC
            """
        ),
        {"days": days},
    )
    return result.mappings().all()


class LeaderboardRow:
    """Lightweight stand-in for UserXP rows returned from the materialized view."""
    __slots__ = ("user_id", "total_xp", "level")

    def __init__(self, user_id, total_xp: int, level: int):
        self.user_id = user_id
        self.total_xp = total_xp
        self.level = level
