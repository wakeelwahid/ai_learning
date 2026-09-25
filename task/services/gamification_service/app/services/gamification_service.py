import random
import uuid
from datetime import date, datetime, timedelta, timezone

import httpx
import redis.asyncio as aioredis
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AlreadyOwnedError, InsufficientPointsError
from app.models.gamification import (
    DAILY_REWARD_CYCLE_LEN,
    EDUPOINTS_COSTS,
    EDUPOINTS_REWARDS,
    ENGAGEMENT_CONFIG_DEFAULTS,
    FEATURE_KEYS,
    FEATURE_LIMIT_SEED,
    LEVEL_UNLOCKS,
    LEVEL_XP_THRESHOLDS,
    SEASON_DURATION_MONTHS,
    STREAK_FREEZE_COST_EP,
    STREAK_FREEZE_MAX,
    ActivityFeedItem,
    ActivityType,
    BadgeType,
    ChallengeType,
    DailyChallenge,
    EduPointEvent,
    EduPointItem,
    EduPointTransaction,
    EngagementConfig,
    FeatureLimit,
    FeatureUsageLog,
    GoalDifficulty,
    GoalSlot,
    GoalTemplate,
    GoalType,
    RewardCalendarDay,
    StreakFreeze,
    UserBadge,
    UserChallengeProgress,
    UserDailyGoal,
    UserDailyReward,
    UserEduPointRedemption,
    UserEduPoints,
    UserStreak,
    UserXP,
    XPEvent,
    XPTransaction,
    XP_REWARDS,
    compute_level,
    xp_for_next_level,
    DAILY_REWARD_SEED,
)


def season_start_for(dt: datetime) -> datetime:
    """Return the start of the 3-month season that contains *dt*."""
    month_group = (dt.month - 1) // SEASON_DURATION_MONTHS * SEASON_DURATION_MONTHS + 1
    return datetime(dt.year, month_group, 1, tzinfo=timezone.utc)


# ─── XP / Level service ───────────────────────────────────────────────────────

class GamificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_or_create_xp(self, user_id: uuid.UUID) -> UserXP:
        result = await self.db.execute(select(UserXP).where(UserXP.user_id == user_id))
        user_xp = result.scalar_one_or_none()
        if not user_xp:
            user_xp = UserXP(
                user_id=user_id,
                total_xp=0,
                level=1,
                season_start=season_start_for(datetime.now(timezone.utc)),
            )
            self.db.add(user_xp)
            await self.db.flush()
        return user_xp

    async def _maybe_reset_season(self, user_xp: UserXP) -> bool:
        """If we have moved into a new season, reset XP and level. Returns True if reset."""
        now = datetime.now(timezone.utc)
        current_season = season_start_for(now)
        if user_xp.season_start is None or user_xp.season_start < current_season:
            user_xp.total_xp = 0
            user_xp.level = 1
            user_xp.season_start = current_season
            return True
        return False

    async def award_xp(
        self,
        user_id: uuid.UUID,
        event: XPEvent,
        reference_id: str | None = None,
    ) -> dict:
        xp_amount = XP_REWARDS.get(event, 0)
        return await self._apply_xp_amount(user_id, xp_amount, event, reference_id)

    async def _apply_xp_amount(
        self,
        user_id: uuid.UUID,
        xp_amount: int,
        event: XPEvent,
        reference_id: str | None = None,
    ) -> dict:
        """Core XP-application logic, factored out of award_xp() so callers that
        need a custom amount not tied to a fixed XP_REWARDS lookup (e.g. the
        Daily Rewards check-in calendar) can still go through the same
        season-reset / level-recompute / badge-award / activity-feed path.

        Dedup: every award with a reference_id is applied at most once per
        (user_id, event, reference_id) — a repeat is a silent no-op that
        returns the user's current totals. This is what stops a caller from
        replaying the same real event (e.g. resubmitting a battle_id) for
        repeated XP, without needing to know whether the event actually
        happened server-side. The unique index on XPTransaction is the real
        race-safe guarantee; this check just avoids a wasted write/500 in the
        common case and gives a clean early return.
        """
        if reference_id is not None:
            existing = await self.db.execute(
                select(XPTransaction).where(
                    XPTransaction.user_id == user_id,
                    XPTransaction.event == event,
                    XPTransaction.reference_id == reference_id,
                )
            )
            if existing.scalar_one_or_none() is not None:
                user_xp = await self._get_or_create_xp(user_id)
                return {
                    "xp_awarded": 0,
                    "total_xp": user_xp.total_xp,
                    "level": user_xp.level,
                    "level_up": False,
                }

        user_xp = await self._get_or_create_xp(user_id)
        await self._maybe_reset_season(user_xp)

        user_xp.total_xp += xp_amount
        # Negative events (e.g. a lost challenge stake) can never take a
        # player below zero — the floor keeps compute_level well-defined.
        if user_xp.total_xp < 0:
            user_xp.total_xp = 0
        old_level = user_xp.level
        user_xp.level = compute_level(user_xp.total_xp)

        self.db.add(XPTransaction(
            user_id=user_id,
            event=event,
            xp_awarded=xp_amount,
            reference_id=reference_id,
        ))
        try:
            await self.db.flush()
        except IntegrityError:
            # Lost the race to a concurrent identical award — roll back this
            # attempt's in-memory changes and return current totals, same as
            # the pre-check no-op path above.
            await self.db.rollback()
            user_xp = await self._get_or_create_xp(user_id)
            return {
                "xp_awarded": 0,
                "total_xp": user_xp.total_xp,
                "level": user_xp.level,
                "level_up": False,
            }

        level_up = user_xp.level > old_level

        # Award level-based badges
        if old_level < 5 <= user_xp.level:
            await self._award_badge(user_id, BadgeType.LEVEL_5)
        if old_level < 10 <= user_xp.level:
            await self._award_badge(user_id, BadgeType.LEVEL_10)
            await self._award_badge(user_id, BadgeType.ELITE_LEARNER)

        if level_up:
            self.db.add(ActivityFeedItem(
                user_id=user_id,
                activity_type=ActivityType.LEVEL_UP,
                title=f"Level {user_xp.level}",
            ))

        return {
            "xp_awarded": xp_amount,
            "total_xp": user_xp.total_xp,
            "level": user_xp.level,
            "level_up": level_up,
        }

    async def get_level_info(self, user_id: uuid.UUID) -> dict:
        user_xp = await self._get_or_create_xp(user_id)
        await self._maybe_reset_season(user_xp)
        lvl = user_xp.level
        next_xp = xp_for_next_level(lvl)
        current_threshold = LEVEL_XP_THRESHOLDS[lvl - 1]
        if next_xp is not None:
            window = LEVEL_XP_THRESHOLDS[lvl] - current_threshold
            progress = min(100.0, (user_xp.total_xp - current_threshold) / window * 100) if window else 100.0
        else:
            progress = 100.0

        unlocked_features: list[str] = []
        for l in range(1, lvl + 1):
            unlocked_features.extend(LEVEL_UNLOCKS.get(l, []))

        next_features = LEVEL_UNLOCKS.get(lvl + 1, []) if lvl < 10 else []
        all_unlocks = {str(l): feats for l, feats in LEVEL_UNLOCKS.items()}

        return {
            "level": lvl,
            "total_xp": user_xp.total_xp,
            "xp_to_next_level": next_xp,
            "unlocked_features": unlocked_features,
            "next_level_features": next_features,
            "progress_percent": round(progress, 1),
            "season_start": user_xp.season_start,
            "all_unlocks": all_unlocks,
        }

    async def update_streak(self, user_id: uuid.UUID) -> dict:
        today = date.today()
        result = await self.db.execute(select(UserStreak).where(UserStreak.user_id == user_id))
        streak = result.scalar_one_or_none()

        if not streak:
            streak = UserStreak(user_id=user_id)
            self.db.add(streak)

        # Normalize integer columns: SQLAlchemy column defaults are only applied at
        # flush time, so a freshly-instantiated row (or a legacy row created before the
        # freeze columns existed) carries None — guard against TypeError in arithmetic.
        streak.current_streak = streak.current_streak or 0
        streak.longest_streak = streak.longest_streak or 0
        streak.freeze_count   = streak.freeze_count or 0

        if streak.last_activity_date == today:
            return {
                "current_streak": streak.current_streak,
                "longest_streak": streak.longest_streak,
                "badges_earned": [],
                "freeze_applied": False,
                "freeze_count": streak.freeze_count,
            }

        yesterday = date.fromordinal(today.toordinal() - 1)
        freeze_applied = False

        if streak.last_activity_date == yesterday:
            # Normal consecutive day — just extend the streak
            streak.current_streak += 1
        elif (
            streak.last_activity_date is not None
            and streak.freeze_count > 0
            and streak.freeze_used_date != today
            # Only auto-apply if exactly one day was missed (i.e. last activity was 2 days ago)
            and (today.toordinal() - streak.last_activity_date.toordinal()) == 2
        ):
            # Missed exactly one day — consume a freeze and preserve the streak
            streak.freeze_count   -= 1
            streak.freeze_used_date = today
            streak.current_streak  += 1
            freeze_applied = True
            self.db.add(StreakFreeze(
                user_id=user_id,
                event="used",
                cost_ep=0,
                freeze_count_after=streak.freeze_count,
            ))
        else:
            streak.current_streak = 1

        streak.longest_streak = max(streak.longest_streak, streak.current_streak)
        streak.last_activity_date = today
        await self.db.flush()

        badges_earned: list[str] = []
        if streak.current_streak == 7:
            await self._award_badge(user_id, BadgeType.STREAK_7)
            badges_earned.append("streak_7")
        if streak.current_streak == 30:
            await self._award_badge(user_id, BadgeType.STREAK_30)
            badges_earned.append("streak_30")

        return {
            "current_streak": streak.current_streak,
            "longest_streak": streak.longest_streak,
            "badges_earned": badges_earned,
            "freeze_applied": freeze_applied,
            "freeze_count": streak.freeze_count,
        }

    async def _award_badge(self, user_id: uuid.UUID, badge: BadgeType) -> None:
        existing = await self.db.execute(
            select(UserBadge).where(UserBadge.user_id == user_id, UserBadge.badge_type == badge)
        )
        if not existing.scalar_one_or_none():
            self.db.add(UserBadge(user_id=user_id, badge_type=badge))
            self.db.add(ActivityFeedItem(
                user_id=user_id,
                activity_type=ActivityType.BADGE_EARNED,
                title=badge.value.replace("_", " ").title(),
            ))

    async def get_leaderboard(self, limit: int = 10) -> list[dict]:
        result = await self.db.execute(
            select(UserXP).order_by(UserXP.total_xp.desc()).limit(limit)
        )
        return [
            {"rank": i + 1, "user_id": str(r.user_id), "total_xp": r.total_xp, "level": r.level}
            for i, r in enumerate(result.scalars().all())
        ]


# ─── EduPoints service ────────────────────────────────────────────────────────

class EduPointsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_or_create(self, user_id: uuid.UUID) -> UserEduPoints:
        result = await self.db.execute(
            select(UserEduPoints).where(UserEduPoints.user_id == user_id)
        )
        record = result.scalar_one_or_none()
        if not record:
            record = UserEduPoints(user_id=user_id)
            self.db.add(record)
            await self.db.flush()
        return record

    async def award(
        self,
        user_id: uuid.UUID,
        event: EduPointEvent,
        reference_id: str | None = None,
    ) -> dict:
        # YOUTUBE_VERIFIED is once-per-account — checked by admin before calling.
        # Dedup: same (user_id, event, reference_id) semantics as XP awards —
        # see GamificationService._apply_xp_amount for the full rationale.
        if reference_id is not None:
            existing = await self.db.execute(
                select(EduPointTransaction).where(
                    EduPointTransaction.user_id == user_id,
                    EduPointTransaction.event == event.value,
                    EduPointTransaction.reference_id == reference_id,
                )
            )
            if existing.scalar_one_or_none() is not None:
                record = await self._get_or_create(user_id)
                return {"points_awarded": 0, "balance": record.balance, "total_earned": record.total_earned}

        points = EDUPOINTS_REWARDS.get(event, 0)
        record = await self._get_or_create(user_id)

        record.balance += points
        record.total_earned += points

        self.db.add(EduPointTransaction(
            user_id=user_id,
            event=event.value,
            points=points,
            balance_after=record.balance,
            reference_id=reference_id,
        ))
        try:
            await self.db.flush()
        except IntegrityError:
            await self.db.rollback()
            record = await self._get_or_create(user_id)
            return {"points_awarded": 0, "balance": record.balance, "total_earned": record.total_earned}

        return {"points_awarded": points, "balance": record.balance, "total_earned": record.total_earned}

    async def award_amount(
        self,
        user_id: uuid.UUID,
        points: int,
        event: EduPointEvent,
        reference_id: str | None = None,
    ) -> dict:
        """Award a caller-computed EduPoints amount, bypassing the fixed
        EDUPOINTS_REWARDS lookup — for callers whose amount is admin-
        configured rather than a fixed per-event constant (Challenge
        Program task/completion rewards). Same dedup/transaction-log
        pattern as award() above, factored out rather than duplicated so
        both share one code path for the actual balance mutation."""
        if reference_id is not None:
            existing = await self.db.execute(
                select(EduPointTransaction).where(
                    EduPointTransaction.user_id == user_id,
                    EduPointTransaction.event == event.value,
                    EduPointTransaction.reference_id == reference_id,
                )
            )
            if existing.scalar_one_or_none() is not None:
                record = await self._get_or_create(user_id)
                return {"points_awarded": 0, "balance": record.balance, "total_earned": record.total_earned}

        record = await self._get_or_create(user_id)
        record.balance += points
        record.total_earned += points

        self.db.add(EduPointTransaction(
            user_id=user_id,
            event=event.value,
            points=points,
            balance_after=record.balance,
            reference_id=reference_id,
        ))
        try:
            await self.db.flush()
        except IntegrityError:
            await self.db.rollback()
            record = await self._get_or_create(user_id)
            return {"points_awarded": 0, "balance": record.balance, "total_earned": record.total_earned}

        return {"points_awarded": points, "balance": record.balance, "total_earned": record.total_earned}

    async def spend(
        self,
        user_id: uuid.UUID,
        item: EduPointItem,
        reference_id: str | None = None,
    ) -> dict:
        cost = EDUPOINTS_COSTS.get(item, 0)
        record = await self._get_or_create(user_id)

        # Prevent re-purchasing permanent unlocks (profile frames, themes, etc.)
        existing = await self.db.execute(
            select(UserEduPointRedemption).where(
                UserEduPointRedemption.user_id == user_id,
                UserEduPointRedemption.item_key == item.value,
                *([UserEduPointRedemption.reference_id == reference_id] if reference_id else []),
            )
        )
        if existing.scalar_one_or_none():
            raise AlreadyOwnedError(f"You already own '{item.value}'")

        if record.balance < cost:
            raise InsufficientPointsError(
                f"Need {cost} EduPoints but you only have {record.balance}."
            )

        record.balance -= cost
        record.total_spent += cost

        self.db.add(EduPointTransaction(
            user_id=user_id,
            item_key=item.value,
            points=-cost,
            balance_after=record.balance,
            reference_id=reference_id,
        ))
        self.db.add(UserEduPointRedemption(
            user_id=user_id,
            item_key=item.value,
            reference_id=reference_id,
        ))
        await self.db.flush()

        return {"cost": cost, "balance_after": record.balance, "item_key": item.value}

    async def get_balance(self, user_id: uuid.UUID) -> dict:
        record = await self._get_or_create(user_id)
        return {
            "balance": record.balance,
            "total_earned": record.total_earned,
            "total_spent": record.total_spent,
        }

    async def get_history(self, user_id: uuid.UUID, limit: int = 50) -> list:
        result = await self.db.execute(
            select(EduPointTransaction)
            .where(EduPointTransaction.user_id == user_id)
            .order_by(EduPointTransaction.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    async def get_owned_items(self, user_id: uuid.UUID) -> list[str]:
        result = await self.db.execute(
            select(UserEduPointRedemption.item_key).where(
                UserEduPointRedemption.user_id == user_id
            )
        )
        return [row[0] for row in result.all()]


# ─── Streak Freeze service ────────────────────────────────────────────────────

class StreakFreezeService:
    """Handles purchasing and auto-applying streak freeze shields.

    Purchase flow:  POST /gamification/streaks/freeze/purchase
      → deducts STREAK_FREEZE_COST_EP EduPoints
      → increments freeze_count on UserStreak (capped at STREAK_FREEZE_MAX)
      → writes StreakFreeze audit row (event="purchased")

    Auto-use:  called inside GamificationService.update_streak() when a streak
      would otherwise break (last_activity_date < yesterday).
      → decrements freeze_count, sets freeze_used_date = today
      → writes StreakFreeze audit row (event="used")
    """

    # Single source of truth: settings.STREAK_FREEZE_COST_EP / STREAK_FREEZE_MAX
    # (app/core/config.py), re-exported from app/models/gamification.py.
    COST_EP   = STREAK_FREEZE_COST_EP
    MAX_BANK  = STREAK_FREEZE_MAX

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_or_create_streak(self, user_id: uuid.UUID) -> UserStreak:
        result = await self.db.execute(select(UserStreak).where(UserStreak.user_id == user_id))
        streak = result.scalar_one_or_none()
        if not streak:
            streak = UserStreak(user_id=user_id)
            self.db.add(streak)
            await self.db.flush()
        return streak

    async def purchase(self, user_id: uuid.UUID) -> dict:
        streak = await self._get_or_create_streak(user_id)

        if streak.freeze_count >= self.MAX_BANK:
            raise HTTPException(
                status_code=400,
                detail=f"You already have the maximum {self.MAX_BANK} freeze shields banked.",
            )

        # Spend EduPoints
        ep_svc = EduPointsService(self.db)
        ep_record = await ep_svc._get_or_create(user_id)
        if ep_record.balance < self.COST_EP:
            raise InsufficientPointsError(
                f"Need {self.COST_EP} EduPoints but you only have {ep_record.balance}."
            )
        ep_record.balance      -= self.COST_EP
        ep_record.total_spent  += self.COST_EP
        self.db.add(EduPointTransaction(
            user_id=user_id,
            item_key="streak_freeze",
            points=-self.COST_EP,
            balance_after=ep_record.balance,
        ))

        # Grant freeze
        streak.freeze_count += 1
        self.db.add(StreakFreeze(
            user_id=user_id,
            event="purchased",
            cost_ep=self.COST_EP,
            freeze_count_after=streak.freeze_count,
        ))
        await self.db.flush()

        return {
            "freeze_count": streak.freeze_count,
            "ep_balance": ep_record.balance,
            "cost_ep": self.COST_EP,
            "max_bank": self.MAX_BANK,
        }

    async def status(self, user_id: uuid.UUID) -> dict:
        streak = await self._get_or_create_streak(user_id)
        ep_svc = EduPointsService(self.db)
        ep     = await ep_svc.get_balance(user_id)
        return {
            "freeze_count":    streak.freeze_count,
            "max_bank":        self.MAX_BANK,
            "cost_ep":         self.COST_EP,
            "ep_balance":      ep["balance"],
            "can_purchase":    ep["balance"] >= self.COST_EP and streak.freeze_count < self.MAX_BANK,
            "freeze_used_date": streak.freeze_used_date.isoformat() if streak.freeze_used_date else None,
        }

    async def try_apply_freeze(self, streak: UserStreak) -> bool:
        """Called when streak would break. Returns True if freeze was consumed."""
        today = date.today()
        if streak.freeze_count <= 0:
            return False
        if streak.freeze_used_date == today:
            # Already used a freeze today — don't double-apply
            return False
        streak.freeze_count   -= 1
        streak.freeze_used_date = today
        self.db.add(StreakFreeze(
            user_id=streak.user_id,
            event="used",
            cost_ep=0,
            freeze_count_after=streak.freeze_count,
        ))
        return True


# ─── Feature Usage service ───────────────────────────────────────────────────
# Single cross-service quota enforcer — every gated action anywhere on the
# platform (AI features, video watch, quiz attempts, battle play, chat)
# calls check_and_log() through this service's internal endpoint instead of
# each service hardcoding its own limit. Replaces the old dead
# FreeTierService (nothing ever called its /increment) and ai_service's own
# hardcoded DAILY_LIMIT=3 in usage_tracker.py.

FEATURE_LABELS: dict[str, str] = {
    "ai_questions":      "AI Questions",
    "ai_quiz":           "AI Quiz",
    "ai_paper":          "AI Paper",
    "ai_custom":         "AI Custom",
    "flashcards":        "Flashcards",
    "revision_plan":     "Revision Plan",
    "ai_chat":           "AI Chat",
    "mistake_analysis":  "Mistake Analysis",
    "video_watch":       "Video Watching",
    "quiz_attempt":      "Quiz Attempts",
    "battle_play":       "Battles",
    "chat_message":      "Messages",
    "chat_group_create": "Group Chats",
    "friend_request":    "Friend Requests",
}


class FeatureLimitService:
    """Admin CRUD over FeatureLimit — mirrors EngagementConfigService's
    get/get_all/set shape so the admin panel pattern is consistent."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all(self) -> list[FeatureLimit]:
        result = await self.db.execute(select(FeatureLimit))
        rows = {r.feature_key: r for r in result.scalars().all()}
        # Any feature key that's never been saved yet still shows up with
        # its seed default — the admin page always lists every known
        # feature, never a partial table.
        missing = [k for k in FEATURE_KEYS if k not in rows]
        for key in missing:
            seed = FEATURE_LIMIT_SEED.get(key, {"free": None, "premium": None})
            rows[key] = FeatureLimit(
                feature_key=key, free_daily_limit=seed["free"],
                premium_daily_limit=seed["premium"], is_active=True,
            )
        return [rows[k] for k in FEATURE_KEYS]

    async def set(self, feature_key: str, free_limit: int | None, premium_limit: int | None, is_active: bool) -> FeatureLimit:
        if feature_key not in FEATURE_KEYS:
            raise HTTPException(status_code=400, detail=f"Unknown feature_key: {feature_key}")
        result = await self.db.execute(select(FeatureLimit).where(FeatureLimit.feature_key == feature_key))
        row = result.scalar_one_or_none()
        if row:
            row.free_daily_limit = free_limit
            row.premium_daily_limit = premium_limit
            row.is_active = is_active
        else:
            row = FeatureLimit(
                feature_key=feature_key, free_daily_limit=free_limit,
                premium_daily_limit=premium_limit, is_active=is_active,
            )
            self.db.add(row)
        await self.db.flush()
        return row


class FeatureUsageService:
    """Redis-first daily quota tracker, generalized across every gated
    feature on the platform (not just AI). Plan tier is resolved from
    payment_service per call (fails open to "free" — the stricter tier —
    if that call fails, so a payment_service outage can't accidentally
    grant unlimited premium access).

    Redis keys:  feature_usage:{user_id}:{feature_key}:{YYYY-MM-DD}
    TTL:         auto-expires at midnight + 1 min so keys clean up daily.
    DB fallback: upserts FeatureUsageLog row when Redis is unavailable.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._redis = None

    async def _get_redis(self):
        if self._redis:
            return self._redis
        try:
            r = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=1)
            await r.ping()
            self._redis = r
            return r
        except Exception:
            return None

    def _key(self, user_id: uuid.UUID, feature_key: str, today: date) -> str:
        return f"feature_usage:{user_id}:{feature_key}:{today.isoformat()}"

    async def _get_plan_tier(self, user_id: uuid.UUID) -> str:
        """"free" or "premium" — fails open to "free" (the stricter tier)
        on any error so a payment_service outage never grants free access
        to a premium-gated quota."""
        try:
            async with httpx.AsyncClient(timeout=settings.PAYMENT_SERVICE_TIMEOUT_SECONDS) as client:
                resp = await client.get(
                    f"{settings.PAYMENT_SERVICE_URL}/api/v1/payments/subscription/status/{user_id}",
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
            if resp.status_code == 200:
                plan = resp.json().get("plan", "free")
                return "premium" if plan == "premium" else "free"
        except Exception:
            pass
        return "free"

    async def _get_limit(self, feature_key: str, tier: str) -> tuple[int | None, bool]:
        """Returns (limit, is_active). limit=None means unlimited."""
        result = await self.db.execute(select(FeatureLimit).where(FeatureLimit.feature_key == feature_key))
        row = result.scalar_one_or_none()
        if row is None:
            seed = FEATURE_LIMIT_SEED.get(feature_key, {"free": None, "premium": None})
            return seed[tier], True
        if not row.is_active:
            return None, False
        return (row.free_daily_limit if tier == "free" else row.premium_daily_limit), True

    async def check_and_log(self, user_id: uuid.UUID, feature_key: str) -> dict:
        """Increment today's usage for feature_key and return the updated
        count. Raises 429 (with an upgrade-prompt message) if the caller's
        plan-tier limit is already reached. A None limit (unlimited, or the
        feature toggled inactive) always passes through without counting."""
        tier = await self._get_plan_tier(user_id)
        limit, active = await self._get_limit(feature_key, tier)
        if not active or limit is None:
            return {"feature_key": feature_key, "tier": tier, "used": None, "limit": None, "remaining": None}

        today = date.today()
        redis = await self._get_redis()
        used = None

        if redis:
            try:
                key = self._key(user_id, feature_key, today)
                used = await redis.incr(key)
                if used == 1:
                    await redis.expire(key, settings.FEATURE_USAGE_KEY_TTL_SECONDS)
            except Exception:
                redis = None

        if not redis:
            await self.db.execute(
                pg_insert(FeatureUsageLog).values(
                    id=uuid.uuid4(), user_id=user_id, feature_key=feature_key,
                    usage_date=today, count=1,
                ).on_conflict_do_update(
                    index_elements=["user_id", "feature_key", "usage_date"],
                    set_={"count": FeatureUsageLog.count + 1},
                )
            )
            await self.db.flush()
            row = await self.db.execute(
                select(FeatureUsageLog).where(
                    FeatureUsageLog.user_id == user_id,
                    FeatureUsageLog.feature_key == feature_key,
                    FeatureUsageLog.usage_date == today,
                )
            )
            row = row.scalar_one_or_none()
            used = row.count if row else 1

        if used > limit:
            label = FEATURE_LABELS.get(feature_key, feature_key.replace("_", " ").title())
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "feature_limit_reached",
                    "feature_key": feature_key,
                    "limit": limit,
                    "used": used,
                    "tier": tier,
                    "message": f"You've reached today's free limit for {label} ({limit}/day). Upgrade to Premium for unlimited access.",
                },
            )

        return {"feature_key": feature_key, "tier": tier, "used": used, "limit": limit, "remaining": max(0, limit - used)}

    async def get_status(self, user_id: uuid.UUID) -> dict:
        """Read-only snapshot for every feature — used by the "Usage Today"
        widget. Does NOT increment anything."""
        tier = await self._get_plan_tier(user_id)
        today = date.today()
        redis = await self._get_redis()
        result: dict = {"tier": tier, "features": {}}

        for feature_key in FEATURE_KEYS:
            limit, active = await self._get_limit(feature_key, tier)
            used = 0
            if active and limit is not None:
                if redis:
                    try:
                        val = await redis.get(self._key(user_id, feature_key, today))
                        used = int(val) if val else 0
                    except Exception:
                        redis = None
                if not redis:
                    row = await self.db.execute(
                        select(FeatureUsageLog).where(
                            FeatureUsageLog.user_id == user_id,
                            FeatureUsageLog.feature_key == feature_key,
                            FeatureUsageLog.usage_date == today,
                        )
                    )
                    row = row.scalar_one_or_none()
                    used = row.count if row else 0

            result["features"][feature_key] = {
                "label": FEATURE_LABELS.get(feature_key, feature_key),
                "used": used if (active and limit is not None) else 0,
                "limit": limit if active else None,
                "remaining": max(0, limit - used) if (active and limit is not None) else None,
            }
        return result



# ─── Daily Challenge service ──────────────────────────────────────────────────

class DailyChallengeService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_today(self) -> DailyChallenge | None:
        today = date.today()
        result = await self.db.execute(
            select(DailyChallenge).where(
                DailyChallenge.challenge_date == today,
                DailyChallenge.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def get_user_progress(
        self, user_id: uuid.UUID, challenge_id: uuid.UUID
    ) -> UserChallengeProgress | None:
        result = await self.db.execute(
            select(UserChallengeProgress).where(
                UserChallengeProgress.user_id == user_id,
                UserChallengeProgress.challenge_id == challenge_id,
            )
        )
        return result.scalar_one_or_none()

    async def _get_or_create_progress(
        self, user_id: uuid.UUID, challenge_id: uuid.UUID
    ) -> UserChallengeProgress:
        prog = await self.get_user_progress(user_id, challenge_id)
        if not prog:
            prog = UserChallengeProgress(user_id=user_id, challenge_id=challenge_id)
            self.db.add(prog)
            await self.db.flush()
        return prog

    async def record_progress(
        self, user_id: uuid.UUID, challenge_id: uuid.UUID, increment: int = 1
    ) -> dict:
        challenge = await self.db.get(DailyChallenge, challenge_id)
        if not challenge:
            return {"error": "Challenge not found"}

        prog = await self._get_or_create_progress(user_id, challenge_id)
        if prog.completed:
            return {"already_completed": True, "progress": prog.progress}

        prog.progress = min(prog.progress + increment, challenge.target_count)
        just_completed = prog.progress >= challenge.target_count

        if just_completed and not prog.completed:
            prog.completed = True
            prog.completed_at = datetime.now(timezone.utc)

        await self.db.flush()
        return {
            "progress": prog.progress,
            "target": challenge.target_count,
            "just_completed": just_completed,
            "xp_reward": challenge.xp_reward if just_completed else 0,
            "ep_reward": challenge.ep_reward if just_completed else 0,
        }

    async def claim_reward(
        self, user_id: uuid.UUID, challenge_id: uuid.UUID
    ) -> dict:
        challenge = await self.db.get(DailyChallenge, challenge_id)
        if not challenge:
            raise ValueError("Challenge not found")

        prog = await self._get_or_create_progress(user_id, challenge_id)
        if not prog.completed:
            raise ValueError("Challenge not yet completed")
        if prog.rewarded:
            raise AlreadyOwnedError("Reward already claimed")

        prog.rewarded = True
        await self.db.flush()
        return {
            "xp_reward": challenge.xp_reward,
            "ep_reward": challenge.ep_reward,
        }

    async def create_challenge(
        self,
        challenge_date: date,
        challenge_type: ChallengeType,
        title: str,
        description: str,
        xp_reward: int,
        ep_reward: int,
        target_ref: str | None = None,
        target_count: int = 1,
    ) -> DailyChallenge:
        challenge = DailyChallenge(
            challenge_date=challenge_date,
            challenge_type=challenge_type,
            title=title,
            description=description,
            xp_reward=xp_reward,
            ep_reward=ep_reward,
            target_ref=target_ref,
            target_count=target_count,
        )
        self.db.add(challenge)
        await self.db.flush()
        return challenge

    async def get_weekly_stats(self, user_id: uuid.UUID) -> dict:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())

        result = await self.db.execute(
            select(UserChallengeProgress, DailyChallenge)
            .join(DailyChallenge, DailyChallenge.id == UserChallengeProgress.challenge_id)
            .where(
                UserChallengeProgress.user_id == user_id,
                DailyChallenge.challenge_date >= week_start,
                UserChallengeProgress.completed == True,
            )
        )
        completed_this_week = len(result.all())
        return {
            "completed_this_week": completed_this_week,
            "weekly_target": 5,
            "weekly_bonus_earned": completed_this_week >= 5,
        }

    async def get_monthly_stats(self, user_id: uuid.UUID) -> dict:
        today = date.today()
        month_start = today.replace(day=1)

        result = await self.db.execute(
            select(UserChallengeProgress, DailyChallenge)
            .join(DailyChallenge, DailyChallenge.id == UserChallengeProgress.challenge_id)
            .where(
                UserChallengeProgress.user_id == user_id,
                DailyChallenge.challenge_date >= month_start,
                UserChallengeProgress.completed == True,
            )
        )
        completed_this_month = len(result.all())
        return {
            "completed_this_month": completed_this_month,
            "monthly_target": 20,
            "monthly_bonus_earned": completed_this_month >= 20,
        }


# ─── Friend Activity Feed service ─────────────────────────────────────────────

class ActivityFeedService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record(
        self,
        user_id: uuid.UUID,
        activity_type: "ActivityType",
        title: str,
        subject: str | None = None,
        score_pct: int | None = None,
        xp_earned: int | None = None,
    ) -> ActivityFeedItem:
        item = ActivityFeedItem(
            user_id=user_id,
            activity_type=activity_type,
            title=title,
            subject=subject,
            score_pct=score_pct,
            xp_earned=xp_earned,
        )
        self.db.add(item)
        await self.db.flush()
        return item

    async def get_mine(self, user_id: uuid.UUID, limit: int = 30) -> list[ActivityFeedItem]:
        result = await self.db.execute(
            select(ActivityFeedItem)
            .where(ActivityFeedItem.user_id == user_id)
            .order_by(ActivityFeedItem.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    async def get_for_users(
        self,
        user_ids: list[uuid.UUID],
        limit: int = 30,
        since: datetime | None = None,
    ) -> list[ActivityFeedItem]:
        if not user_ids:
            return []
        q = select(ActivityFeedItem).where(ActivityFeedItem.user_id.in_(user_ids))
        if since:
            q = q.where(ActivityFeedItem.created_at >= since)
        q = q.order_by(ActivityFeedItem.created_at.desc()).limit(limit)
        result = await self.db.execute(q)
        return result.scalars().all()


# ─── Daily Rewards (Day 1-7 check-in calendar) service ───────────────────────

class DailyRewardService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _calendar(self) -> dict[int, RewardCalendarDay]:
        """Admin-editable Day 1-7 reward table (see RewardCalendarDay) — no
        code deploy required to change values, unlike the old hardcoded dict
        this replaced."""
        result = await self.db.execute(select(RewardCalendarDay))
        rows = {r.day_in_cycle: r for r in result.scalars().all()}
        if len(rows) < DAILY_REWARD_CYCLE_LEN:
            # First boot / partially seeded — fill in any missing days from
            # the built-in defaults so the feature always works out of the box.
            for day, seed in DAILY_REWARD_SEED.items():
                if day not in rows:
                    row = RewardCalendarDay(day_in_cycle=day, xp=seed["xp"], ep=seed["ep"], label=seed["label"])
                    self.db.add(row)
                    rows[day] = row
            await self.db.flush()
        return rows

    async def _last_claim(self, user_id: uuid.UUID) -> UserDailyReward | None:
        result = await self.db.execute(
            select(UserDailyReward)
            .where(UserDailyReward.user_id == user_id)
            .order_by(UserDailyReward.claim_date.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _next_cycle_day(last: UserDailyReward | None, today: date) -> int:
        if not last:
            return 1
        if last.claim_date == today:
            return last.day_in_cycle
        yesterday = date.fromordinal(today.toordinal() - 1)
        if last.claim_date == yesterday:
            return (last.day_in_cycle % DAILY_REWARD_CYCLE_LEN) + 1
        return 1  # a day was missed — cycle resets

    # A claim becomes available again exactly this long after the previous one
    # — the popup-open decision, the countdown, and claim eligibility are all
    # derived from this server-side; clients never run their own timer.
    # Configurable via settings.DAILY_REWARD_CLAIM_COOLDOWN_SECONDS.
    CLAIM_COOLDOWN_SECONDS = settings.DAILY_REWARD_CLAIM_COOLDOWN_SECONDS

    async def _claim_streak(self, user_id: uuid.UUID) -> int:
        """Consecutive-calendar-day claim streak ending at the most recent
        claim (0 if the last claim is older than yesterday)."""
        result = await self.db.execute(
            select(UserDailyReward.claim_date)
            .where(UserDailyReward.user_id == user_id)
            .order_by(UserDailyReward.claim_date.desc())
            .limit(60)
        )
        dates = [r[0] for r in result.all()]
        if not dates:
            return 0
        today = date.today()
        if (today - dates[0]).days > 1:
            return 0
        streak = 1
        for prev, cur in zip(dates, dates[1:]):
            if (prev - cur).days == 1:
                streak += 1
            else:
                break
        return streak

    def _cooldown_remaining(self, last: UserDailyReward | None) -> int:
        """Seconds until the next claim unlocks (0 = claimable now)."""
        if not last or not last.created_at:
            return 0
        elapsed = (datetime.now(timezone.utc) - last.created_at).total_seconds()
        return max(0, int(self.CLAIM_COOLDOWN_SECONDS - elapsed))

    async def status(self, user_id: uuid.UUID) -> dict:
        today = date.today()
        calendar_rows = await self._calendar()
        last = await self._last_claim(user_id)
        claimed_today = bool(last and last.claim_date == today)
        current_day = self._next_cycle_day(last, today)
        calendar = [
            {"day": d, "xp": calendar_rows[d].xp, "ep": calendar_rows[d].ep, "label": calendar_rows[d].label,
             "claimed": claimed_today and d == current_day}
            for d in range(1, DAILY_REWARD_CYCLE_LEN + 1)
        ]
        reward_row = calendar_rows[current_day]
        next_claim_in = self._cooldown_remaining(last)
        can_claim = next_claim_in == 0 and not claimed_today
        next_day = (current_day % DAILY_REWARD_CYCLE_LEN) + 1
        next_row = calendar_rows[next_day]
        return {
            "claimed_today": claimed_today,
            "current_day": current_day,
            "reward": {"xp": reward_row.xp, "ep": reward_row.ep, "label": reward_row.label},
            "calendar": calendar,
            # Popup contract: the client opens the Daily Reward popup iff the
            # backend says so — no frontend timers or date math anywhere.
            "can_claim": can_claim,
            "should_show_popup": can_claim,
            "current_streak": await self._claim_streak(user_id),
            "next_claim_in_seconds": next_claim_in,
            "next_reward": {"day": next_day, "xp": next_row.xp, "ep": next_row.ep, "label": next_row.label},
        }

    async def claim(self, user_id: uuid.UUID) -> dict:
        today = date.today()
        calendar_rows = await self._calendar()
        last = await self._last_claim(user_id)
        if last and last.claim_date == today:
            raise HTTPException(status_code=409, detail="Today's reward has already been claimed.")
        remaining = self._cooldown_remaining(last)
        if remaining > 0:
            raise HTTPException(
                status_code=409,
                detail=f"Next reward unlocks in {remaining // 3600}h {(remaining % 3600) // 60}m.",
            )

        day = self._next_cycle_day(last, today)
        reward_row = calendar_rows[day]

        # QBG-013: reference_id must key off the actual calendar claim_date,
        # not the cyclic day-in-cycle (1..DAILY_REWARD_CYCLE_LEN). `day`
        # repeats every cycle by design (e.g. day 1 recurs on every new
        # streak), so "daily_reward_day_{day}" collides across a user's
        # lifetime as soon as they complete 2+ cycles — it is not a valid
        # global anti-replay key. `today` is already unique per user here
        # (the claim_date == today check above and the uq_daily_reward_user_date
        # constraint on UserDailyReward both guarantee at most one claim per
        # user per calendar day), so keying on it makes reference_id genuinely
        # unique per real claim while staying consistent with that backstop.
        claim_reference_id = f"daily_reward_{today.isoformat()}"

        if reward_row.xp > 0:
            await GamificationService(self.db)._apply_xp_amount(
                user_id, reward_row.xp, XPEvent.DAILY_LOGIN, reference_id=claim_reference_id
            )

        if reward_row.ep > 0:
            ep_svc = EduPointsService(self.db)
            record = await ep_svc._get_or_create(user_id)
            record.balance += reward_row.ep
            record.total_earned += reward_row.ep
            self.db.add(EduPointTransaction(
                user_id=user_id,
                event="daily_reward",
                points=reward_row.ep,
                balance_after=record.balance,
                reference_id=claim_reference_id,
            ))

        self.db.add(UserDailyReward(
            user_id=user_id,
            claim_date=today,
            day_in_cycle=day,
            xp_awarded=reward_row.xp,
            ep_awarded=reward_row.ep,
            reward_label=reward_row.label,
        ))
        try:
            await self.db.flush()
        except IntegrityError:
            # Lost a concurrent race to claim today's reward — the
            # uq_daily_reward_user_date constraint is what actually prevents
            # the double grant; this just makes the losing request surface
            # the same clean 409 a sequential duplicate claim gets, instead
            # of an unhandled 500 (the XP/EP awards above already committed
            # via their own sessions/flushes, so roll back only this
            # attempt's UserDailyReward insert).
            await self.db.rollback()
            raise HTTPException(status_code=409, detail="Today's reward has already been claimed.")

        next_day = (day % DAILY_REWARD_CYCLE_LEN) + 1
        next_row = calendar_rows[next_day]
        return {
            "day": day,
            "xp_awarded": reward_row.xp,
            "ep_awarded": reward_row.ep,
            "reward_label": reward_row.label,
            "next_day": next_day,
            "current_streak": await self._claim_streak(user_id),
            "next_claim_in_seconds": self.CLAIM_COOLDOWN_SECONDS,
            "next_reward": {"day": next_day, "xp": next_row.xp, "ep": next_row.ep, "label": next_row.label},
        }


# ─── Engagement Config service (generic key→JSON admin settings) ────────────

class EngagementConfigService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, key: str) -> dict:
        result = await self.db.execute(select(EngagementConfig).where(EngagementConfig.key == key))
        row = result.scalar_one_or_none()
        if row:
            return row.value
        return ENGAGEMENT_CONFIG_DEFAULTS.get(key, {"value": None})

    async def get_all(self) -> dict[str, dict]:
        result = await self.db.execute(select(EngagementConfig))
        rows = {r.key: r.value for r in result.scalars().all()}
        for key, default in ENGAGEMENT_CONFIG_DEFAULTS.items():
            rows.setdefault(key, default)
        return rows

    async def set(self, key: str, value: dict) -> EngagementConfig:
        result = await self.db.execute(select(EngagementConfig).where(EngagementConfig.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = value
        else:
            row = EngagementConfig(key=key, value=value)
            self.db.add(row)
        await self.db.flush()
        return row


# ─── Daily Goal service ───────────────────────────────────────────────────────

class GoalService:
    """v2: every active user gets 4 fixed daily slots (GoalSlot.VIDEO / QUIZ
    / AI_DOUBT / STREAK) instead of the old v1 single random goal. When
    `daily_goal_personalized` is on, the video slot's SPECIFIC videos and
    the quiz slot's SPECIFIC quiz are chosen per-student (weak-topic +
    class/board), not just "any video/quiz of that type counts" — see
    _assign_video_slot/_assign_quiz_slot."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_today_slots(self, user_id: uuid.UUID, today: date) -> dict[GoalSlot, UserDailyGoal]:
        result = await self.db.execute(
            select(UserDailyGoal).where(UserDailyGoal.user_id == user_id, UserDailyGoal.goal_date == today)
        )
        rows = result.scalars().all()
        return {row.slot: row for row in rows}

    async def _pick_template(self, slot: GoalSlot) -> GoalTemplate | None:
        """Random active template FROM THIS SLOT'S POOL — a template
        authored for the quiz slot never displaces the video slot's goal,
        and vice versa."""
        result = await self.db.execute(
            select(GoalTemplate).where(GoalTemplate.is_active == True, GoalTemplate.slot == slot)  # noqa: E712
        )
        templates = result.scalars().all()
        return random.choice(templates) if templates else None

    async def _fetch_user_curriculum(self, user_id: uuid.UUID) -> tuple[int | None, str | None]:
        """(class_num, board) for personalization — same internal call
        content_service's curriculum route already makes. Fails open to
        (None, None) so personalization degrades to "any class/board"
        rather than blocking goal assignment."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(
                    f"{settings.USER_SERVICE_URL}/api/v1/users/internal/profile/{user_id}",
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
            if resp.status_code == 200:
                doc = resp.json()
                return doc.get("class_number"), doc.get("board")
        except Exception:
            pass
        return None, None

    async def _assign_video_slot(self, user_id: uuid.UUID, template: GoalTemplate) -> tuple[list[str], str]:
        """Picks the SPECIFIC video ids that count toward this user's video
        goal today (weak-topic personalized, class/board fallback) and
        returns (video_ids, title) — title gets each video's real name
        appended when personalization succeeds, otherwise stays the generic
        "{count}" title. Fails open to an empty pick (goal still gets
        created with the generic title; record_progress's per-completion
        increment still works with no pinned ids, it just won't deep-link
        to something specific)."""
        title = template.title_template.format(count=template.target_count)
        try:
            class_num, board = await self._fetch_user_curriculum(user_id)
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(
                    f"{settings.CONTENT_SERVICE_URL}/api/v1/content/videos/internal/daily-goal-picks/{user_id}",
                    params={"count": template.target_count, "class_num": class_num, "board": board},
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
            if resp.status_code == 200:
                doc = resp.json()
                video_ids = doc.get("video_ids") or []
                videos = doc.get("videos") or []
                if videos:
                    names = ", ".join(v["title"] for v in videos)
                    title = f"{title} — {names}"
                return video_ids, title
        except Exception:
            pass
        return [], title

    async def _assign_quiz_slot(self, user_id: uuid.UUID, template: GoalTemplate) -> tuple[uuid.UUID | None, str]:
        """Picks the SPECIFIC quiz that counts toward this user's quiz goal
        today (class/board personalized via quiz_service's existing
        /quizzes/random, which already falls back to "any active quiz" when
        nothing matches the student's curriculum). Fails open to no pinned
        quiz (generic title, "any quiz" still counts via record_progress)."""
        title = template.title_template.format(count=template.target_count)
        try:
            class_num, board = await self._fetch_user_curriculum(user_id)
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(
                    f"{settings.QUIZ_SERVICE_URL}/api/v1/quizzes/random",
                    params={"class_num": class_num, "board": board},
                )
            if resp.status_code == 200:
                doc = resp.json()
                quiz_id = uuid.UUID(doc["id"]) if doc.get("id") else None
                if doc.get("title"):
                    title = f"{title} — {doc['title']}"
                return quiz_id, title
        except Exception:
            pass
        return None, title

    async def _create_slot_goal(
        self, user_id: uuid.UUID, today: date, slot: GoalSlot, personalized: bool,
    ) -> UserDailyGoal | None:
        template = await self._pick_template(slot)
        if not template:
            return None

        title = template.title_template.format(count=template.target_count)
        assigned_video_ids: list[str] | None = None
        assigned_quiz_id: uuid.UUID | None = None

        if personalized and slot == GoalSlot.VIDEO:
            assigned_video_ids, title = await self._assign_video_slot(user_id, template)
        elif personalized and slot == GoalSlot.QUIZ:
            assigned_quiz_id, title = await self._assign_quiz_slot(user_id, template)

        # STREAK auto-completes the instant it's assigned — reaching
        # get_or_create_today at all already means the user opened the app
        # today, which is the entire "goal", so there's no separate
        # completion event to wait for (unlike video/quiz/ai_doubt, which
        # wait for record_progress). Reward is granted immediately below,
        # same path record_progress uses for the other slots.
        is_streak = slot == GoalSlot.STREAK
        goal = UserDailyGoal(
            user_id=user_id,
            goal_date=today,
            slot=slot,
            template_id=template.id,
            goal_type=template.goal_type,
            title=title,
            target_count=template.target_count,
            progress=template.target_count if is_streak else 0,
            completed=is_streak,
            completed_at=datetime.now(timezone.utc) if is_streak else None,
            xp_reward=template.xp_reward,
            ep_reward=template.ep_reward,
            reward_granted=is_streak,
            assigned_video_ids=assigned_video_ids or None,
            assigned_quiz_id=assigned_quiz_id,
        )
        self.db.add(goal)
        try:
            await self.db.flush()
        except IntegrityError:
            # Lost a race with another concurrent request creating the same
            # (user_id, goal_date, slot) row — discard ours, return theirs.
            await self.db.rollback()
            existing = await self._get_today_slots(user_id, today)
            return existing.get(slot)

        if is_streak:
            if goal.xp_reward > 0:
                await GamificationService(self.db)._apply_xp_amount(
                    user_id, goal.xp_reward, XPEvent.WEEKLY_GOAL, reference_id=f"daily_goal_{goal.id}"
                )
            if goal.ep_reward > 0:
                ep_svc = EduPointsService(self.db)
                record = await ep_svc._get_or_create(user_id)
                record.balance += goal.ep_reward
                record.total_earned += goal.ep_reward
                self.db.add(EduPointTransaction(
                    user_id=user_id, event="daily_goal", points=goal.ep_reward,
                    balance_after=record.balance, reference_id=f"daily_goal_{goal.id}",
                ))
            self.db.add(ActivityFeedItem(
                user_id=user_id, activity_type=ActivityType.DAILY_GOAL_COMPLETED,
                title=goal.title, xp_earned=goal.xp_reward,
            ))
            await self.db.flush()
        return goal

    async def get_or_create_today(
        self, user_id: uuid.UUID, *, engagement_config: dict[str, dict] | None = None,
    ) -> list[UserDailyGoal]:
        """Returns all of today's slot goals for this user (up to 4 — video/
        quiz/ai_doubt/streak), creating any missing slot's row on first read
        (new signup, missed cron tick — a slot with no active template
        simply stays absent from the returned list rather than erroring).
        Returns [] entirely if the daily-goal feature is off.

        engagement_config lets a caller looping over many users (e.g.
        generate_for_active_users) pass in one pre-fetched
        EngagementConfigService.get_all() instead of this function
        re-querying the same two config rows on every single call."""
        today = date.today()
        existing = await self._get_today_slots(user_id, today)

        if engagement_config is not None:
            enabled_cfg = engagement_config.get("daily_goal_enabled", {"value": None})
            personalized_cfg = engagement_config.get("daily_goal_personalized", {"value": None})
        else:
            enabled_cfg = await EngagementConfigService(self.db).get("daily_goal_enabled")
            personalized_cfg = await EngagementConfigService(self.db).get("daily_goal_personalized")

        if enabled_cfg.get("value") is False:
            return list(existing.values())

        personalized = personalized_cfg.get("value") is True

        for slot in (GoalSlot.VIDEO, GoalSlot.QUIZ, GoalSlot.AI_DOUBT, GoalSlot.STREAK):
            if slot in existing:
                continue
            goal = await self._create_slot_goal(user_id, today, slot, personalized)
            if goal:
                existing[slot] = goal

        return list(existing.values())

    async def get_or_create_today_single(self, user_id: uuid.UUID, goal_type: GoalType) -> UserDailyGoal | None:
        """Internal helper for record_progress — resolves/creates all of
        today's slots (idempotent) then returns whichever one matches the
        completion event's goal_type, if any."""
        goals = await self.get_or_create_today(user_id)
        for g in goals:
            if g.goal_type == goal_type:
                return g
        return None

    async def record_progress(self, user_id: uuid.UUID, goal_type: GoalType, increment: int = 1) -> dict | None:
        """Called by quiz_service/content_service/ai_service on a qualifying
        completion event. Idempotent no-op if there's no matching goal for
        today (e.g. that slot has no active template) or it's already
        completed."""
        goal = await self.get_or_create_today_single(user_id, goal_type)
        if not goal or goal.completed:
            return None

        goal.progress = min(goal.progress + increment, goal.target_count)
        just_completed = goal.progress >= goal.target_count

        if just_completed:
            goal.completed = True
            goal.completed_at = datetime.now(timezone.utc)
            if not goal.reward_granted:
                goal.reward_granted = True
                if goal.xp_reward > 0:
                    await GamificationService(self.db)._apply_xp_amount(
                        user_id, goal.xp_reward, XPEvent.WEEKLY_GOAL, reference_id=f"daily_goal_{goal.id}"
                    )
                if goal.ep_reward > 0:
                    ep_svc = EduPointsService(self.db)
                    record = await ep_svc._get_or_create(user_id)
                    record.balance += goal.ep_reward
                    record.total_earned += goal.ep_reward
                    self.db.add(EduPointTransaction(
                        user_id=user_id, event="daily_goal", points=goal.ep_reward,
                        balance_after=record.balance, reference_id=f"daily_goal_{goal.id}",
                    ))
                self.db.add(ActivityFeedItem(
                    user_id=user_id, activity_type=ActivityType.DAILY_GOAL_COMPLETED,
                    title=goal.title, xp_earned=goal.xp_reward,
                ))

        await self.db.flush()
        return {
            "goal_id": str(goal.id), "progress": goal.progress, "target": goal.target_count,
            "just_completed": just_completed,
        }

    async def generate_for_active_users(self) -> int:
        """Morning-job entry point: assigns today's 3 slot-goals to every
        user with an existing engagement footprint (a user_streaks row —
        i.e. anyone who has ever recorded activity). Idempotent per user/slot
        via the unique (user_id, goal_date, slot) constraint. Returns the
        count of (user, slot) goals generated (not user count) — a fuller
        signal for the admin analytics strip than a single per-user tally."""
        engagement_config = await EngagementConfigService(self.db).get_all()
        if engagement_config.get("daily_goal_enabled", {}).get("value") is False:
            return 0

        result = await self.db.execute(select(UserStreak.user_id))
        user_ids = [row[0] for row in result.all()]
        today = date.today()
        count = 0
        for uid in user_ids:
            existing_slots = set(await self._get_today_slots(uid, today))
            goals = await self.get_or_create_today(uid, engagement_config=engagement_config)
            count += sum(1 for g in goals if g.slot not in existing_slots)
            await self.db.commit()
        return count
