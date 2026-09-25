import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Enum, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.database.base import Base


# QBG-013: cutover for the (user_id, event, reference_id) dedup indexes on
# XPTransaction/EduPointTransaction below. Must stay byte-identical to the
# cutover baked into alembic/versions/fix_daily_reward_dedup_cutover.py —
# create_all() (tests, fresh DBs) builds these partial indexes from the
# models here, while a live DB gets them from that migration; both must
# produce the exact same index definition. See that migration's docstring
# for the full reasoning. Do not change this value after the migration has
# been applied anywhere.
DAILY_REWARD_DEDUP_CUTOVER = datetime(2026, 9, 18, 0, 0, 0, tzinfo=timezone.utc)


# ─── Level thresholds & feature unlocks ──────────────────────────────────────

LEVEL_XP_THRESHOLDS = [0, 100, 300, 700, 1_200, 2_000, 3_000, 4_500, 6_000, 8_000]

LEVEL_UNLOCKS: dict[int, list[str]] = {
    1:  ["video_learning", "notes", "quizzes", "leaderboard", "daily_streak"],
    2:  ["solo_battle", "progress_analytics"],
    3:  ["private_battle", "public_battle", "referral_program", "battle_sharing"],
    4:  ["group_battle", "flashcards", "revision_center"],
    5:  ["smart_revision_plan", "weak_topic_analysis", "premium_pyq_pack_1"],
    6:  ["career_explorer", "personalized_study_goals"],
    7:  ["ai_study_mentor", "premium_quiz_packs"],
    8:  ["team_battle", "study_party"],
    9:  ["class_battle", "advanced_analytics"],
    10: ["elite_tournament", "exclusive_seasonal_competitions", "elite_learner_badge", "gold_profile_frame"],
}

# Configurable via settings.SEASON_DURATION_MONTHS (app/core/config.py) — kept
# as a module-level re-export since other modules import this name directly.
SEASON_DURATION_MONTHS = settings.SEASON_DURATION_MONTHS


def compute_level(xp: int) -> int:
    """Map total XP to a level using the fixed season thresholds (max level 10)."""
    level = 1
    for i, threshold in enumerate(LEVEL_XP_THRESHOLDS):
        if xp >= threshold:
            level = i + 1
    return min(level, 10)


def xp_for_next_level(current_level: int) -> int | None:
    """XP required to reach the next level, or None if already at max."""
    if current_level >= 10:
        return None
    return LEVEL_XP_THRESHOLDS[current_level]


# ─── Badge types ──────────────────────────────────────────────────────────────

class BadgeType(str, enum.Enum):
    FIRST_VIDEO        = "first_video"
    QUIZ_ACE           = "quiz_ace"
    STREAK_7           = "streak_7"
    STREAK_30          = "streak_30"
    CHAPTER_COMPLETE   = "chapter_complete"
    SUBJECT_COMPLETE   = "subject_complete"
    REFERRAL_CHAMPION  = "referral_champion"
    PREMIUM_MEMBER     = "premium_member"
    BATTLE_CHAMPION    = "battle_champion"
    QUIZ_WARRIOR       = "quiz_warrior"
    TOP_PERFORMER      = "top_performer"
    WIN_STREAK_5       = "win_streak_5"
    LEVEL_5            = "level_5"
    LEVEL_10           = "level_10"
    ELITE_LEARNER      = "elite_learner"
    CHALLENGE_COMPLETE = "challenge_complete"


# ─── XP events (leveling currency — resets each season) ──────────────────────

class XPEvent(str, enum.Enum):
    DAILY_LOGIN        = "daily_login"
    VIDEO_WATCHED      = "video_watched"
    QUIZ_COMPLETED     = "quiz_completed"
    QUIZ_SCORE_80      = "quiz_score_80"
    QUIZ_PERFECT       = "quiz_perfect"
    SOLO_BATTLE_WIN    = "solo_battle_win"
    PRIVATE_BATTLE_WIN = "private_battle_win"
    PUBLIC_BATTLE_TOP3 = "public_battle_top3"
    GROUP_BATTLE_TOP3  = "group_battle_top3"
    TEAM_BATTLE_WIN    = "team_battle_win"
    CLASS_BATTLE_WIN   = "class_battle_win"
    SCHOOL_BATTLE_WIN  = "school_battle_win"
    BATTLE_PLAYED      = "battle_played"
    REVISION_COMPLETE  = "revision_complete"
    WEEKLY_GOAL        = "weekly_goal"
    STREAK_7           = "streak_7"
    STREAK_30          = "streak_30"
    REFERRAL_SUCCESS   = "referral_success"
    CHAPTER_COMPLETE   = "chapter_complete"
    CAREER_GOAL_SET    = "career_goal_set"
    SKILL_GAP_DONE     = "skill_gap_done"
    CHALLENGE_WIN      = "challenge_win"    # friend-challenge stake battle won
    CHALLENGE_LOSS     = "challenge_loss"   # friend-challenge stake battle lost (negative XP)
    CHALLENGE_TASK_COMPLETE    = "challenge_task_complete"    # multi-day Challenge Program: one task done
    CHALLENGE_PROGRAM_COMPLETE = "challenge_program_complete" # multi-day Challenge Program: all days done


XP_REWARDS: dict[XPEvent, int] = {
    XPEvent.DAILY_LOGIN:        5,
    XPEvent.VIDEO_WATCHED:      10,
    XPEvent.QUIZ_COMPLETED:     20,
    XPEvent.QUIZ_SCORE_80:      30,
    XPEvent.QUIZ_PERFECT:       50,
    XPEvent.SOLO_BATTLE_WIN:    40,
    XPEvent.PRIVATE_BATTLE_WIN: 60,
    XPEvent.PUBLIC_BATTLE_TOP3: 80,
    XPEvent.GROUP_BATTLE_TOP3:  100,
    XPEvent.TEAM_BATTLE_WIN:    120,
    XPEvent.CLASS_BATTLE_WIN:   150,
    XPEvent.SCHOOL_BATTLE_WIN:  200,
    XPEvent.BATTLE_PLAYED:      15,
    XPEvent.REVISION_COMPLETE:  80,
    XPEvent.WEEKLY_GOAL:        100,
    XPEvent.STREAK_7:           150,
    XPEvent.STREAK_30:          500,
    XPEvent.REFERRAL_SUCCESS:   200,
    XPEvent.CHAPTER_COMPLETE:   100,
    XPEvent.CAREER_GOAL_SET:    50,
    XPEvent.SKILL_GAP_DONE:     30,
    XPEvent.CHALLENGE_WIN:      100,
    XPEvent.CHALLENGE_LOSS:     -50,
}

# Minimum XP a player must hold to enter a friend-challenge stake battle —
# guarantees the loser can actually pay the CHALLENGE_LOSS stake.
# Configurable via settings.CHALLENGE_MIN_XP (app/core/config.py) — kept as a
# module-level re-export since other modules import this name directly.
CHALLENGE_MIN_XP = settings.CHALLENGE_MIN_XP


# ─── EduPoints events (permanent spending currency — never resets) ────────────

class EduPointEvent(str, enum.Enum):
    DAILY_LOGIN        = "daily_login"
    VIDEO_WATCHED      = "video_watched"
    QUIZ_COMPLETED     = "quiz_completed"
    QUIZ_SCORE_80      = "quiz_score_80"
    QUIZ_PERFECT       = "quiz_perfect"
    SOLO_BATTLE_WIN    = "solo_battle_win"
    PRIVATE_BATTLE_WIN = "private_battle_win"
    PUBLIC_BATTLE_TOP3 = "public_battle_top3"
    GROUP_BATTLE_TOP3  = "group_battle_top3"
    TEAM_BATTLE_WIN    = "team_battle_win"
    CLASS_BATTLE_WIN   = "class_battle_win"
    SCHOOL_BATTLE_WIN  = "school_battle_win"
    REVISION_COMPLETE  = "revision_complete"
    WEEKLY_GOAL        = "weekly_goal"
    STREAK_7           = "streak_7"
    STREAK_30          = "streak_30"
    REFERRAL_SUCCESS   = "referral_success"
    YOUTUBE_VERIFIED   = "youtube_verified"     # admin-approved, once per account
    CHALLENGE_WIN      = "challenge_win"        # friend-challenge stake battle won
    CHALLENGE_TASK_COMPLETE    = "challenge_task_complete"    # multi-day Challenge Program: one task done
    CHALLENGE_PROGRAM_COMPLETE = "challenge_program_complete" # multi-day Challenge Program: all days done


EDUPOINTS_REWARDS: dict[EduPointEvent, int] = {
    EduPointEvent.DAILY_LOGIN:        1,
    EduPointEvent.VIDEO_WATCHED:      3,
    EduPointEvent.QUIZ_COMPLETED:     5,
    EduPointEvent.QUIZ_SCORE_80:      10,
    EduPointEvent.QUIZ_PERFECT:       15,
    EduPointEvent.SOLO_BATTLE_WIN:    10,
    EduPointEvent.PRIVATE_BATTLE_WIN: 15,
    EduPointEvent.PUBLIC_BATTLE_TOP3: 20,
    EduPointEvent.GROUP_BATTLE_TOP3:  30,
    EduPointEvent.TEAM_BATTLE_WIN:    40,
    EduPointEvent.CLASS_BATTLE_WIN:   50,
    EduPointEvent.SCHOOL_BATTLE_WIN:  75,
    EduPointEvent.REVISION_COMPLETE:  20,
    EduPointEvent.WEEKLY_GOAL:        25,
    EduPointEvent.STREAK_7:           50,
    EduPointEvent.STREAK_30:          150,
    EduPointEvent.REFERRAL_SUCCESS:   250,
    EduPointEvent.YOUTUBE_VERIFIED:   500,
    EduPointEvent.CHALLENGE_WIN:      50,
}


class EduPointItem(str, enum.Enum):
    # Premium Quiz Packs
    CHAPTER_QUIZ_PACK   = "chapter_quiz_pack"
    SUBJECT_QUIZ_PACK   = "subject_quiz_pack"
    ADVANCED_QUIZ_PACK  = "advanced_quiz_pack"
    # Flashcards
    CHAPTER_FLASHCARDS  = "chapter_flashcards"
    SUBJECT_FLASHCARDS  = "subject_flashcards"
    # PYQ Collections
    CHAPTER_PYQ_PACK    = "chapter_pyq_pack"
    SUBJECT_PYQ_PACK    = "subject_pyq_pack"
    COMPLETE_EXAM_PYQ   = "complete_exam_pyq"
    # Knowledge Videos
    TECH_VIDEOS         = "tech_videos"
    AI_LEARNING_VIDEOS  = "ai_learning_videos"
    CAREER_VIDEOS       = "career_videos"
    # Profile Customization
    FRAME_BRONZE        = "frame_bronze"
    FRAME_SILVER        = "frame_silver"
    FRAME_GOLD          = "frame_gold"
    PROFILE_THEME       = "profile_theme"
    PREMIUM_BADGE       = "premium_badge"
    # Streak Protection
    STREAK_FREEZE       = "streak_freeze"   # 50 EP → +1 freeze (max 3 banked)


EDUPOINTS_COSTS: dict[EduPointItem, int] = {
    EduPointItem.CHAPTER_QUIZ_PACK:   50,
    EduPointItem.SUBJECT_QUIZ_PACK:   100,
    EduPointItem.ADVANCED_QUIZ_PACK:  150,
    EduPointItem.CHAPTER_FLASHCARDS:  50,
    EduPointItem.SUBJECT_FLASHCARDS:  100,
    EduPointItem.CHAPTER_PYQ_PACK:    100,
    EduPointItem.SUBJECT_PYQ_PACK:    200,
    EduPointItem.COMPLETE_EXAM_PYQ:   300,
    EduPointItem.TECH_VIDEOS:         100,
    EduPointItem.AI_LEARNING_VIDEOS:  150,
    EduPointItem.CAREER_VIDEOS:       150,
    EduPointItem.FRAME_BRONZE:        50,
    EduPointItem.FRAME_SILVER:        100,
    EduPointItem.FRAME_GOLD:          200,
    EduPointItem.PROFILE_THEME:       150,
    EduPointItem.PREMIUM_BADGE:       100,
    EduPointItem.STREAK_FREEZE:       settings.STREAK_FREEZE_COST_EP,   # single source: settings.STREAK_FREEZE_COST_EP
}

# Maximum number of streak freezes a user can bank at once.
# Both configurable via settings.STREAK_FREEZE_MAX / STREAK_FREEZE_COST_EP
# (app/core/config.py) — kept as module-level re-exports since other modules
# (including StreakFreezeService in app/services/gamification_service.py)
# import these names directly. This is the single source of truth for these
# two numbers — do not hardcode separate copies elsewhere.
STREAK_FREEZE_MAX = settings.STREAK_FREEZE_MAX
STREAK_FREEZE_COST_EP = settings.STREAK_FREEZE_COST_EP


# ─── Feature Usage Limits (admin-configurable, cross-service) ────────────────
# Replaces the old dead FreeTierUsage/FREE_TIER_LIMITS (nothing ever
# incremented that table — see git history) and ai_service's own hardcoded
# DAILY_LIMIT=3 in usage_tracker.py. This is the single source of truth for
# every per-feature daily quota across the whole platform: AI features
# (questions/quiz/paper/custom/flashcards/revision_plan/ai_chat/
# mistake_analysis), video watching, quiz attempts, battle create/join, and
# chat (messages/group-creation/friend-requests). Each service calls this
# service's internal usage-check endpoint (see routes/feature_usage.py)
# instead of enforcing its own hardcoded limit.

FEATURE_KEYS: list[str] = [
    "ai_questions", "ai_quiz", "ai_paper", "ai_custom",
    "flashcards", "revision_plan", "ai_chat", "mistake_analysis",
    "video_watch", "quiz_attempt", "battle_play",
    "chat_message", "chat_group_create", "friend_request",
]

# Seed values only — admin can change every one of these from the Feature
# Limits admin page with no deploy. None = unlimited for that plan tier.
FEATURE_LIMIT_SEED: dict[str, dict] = {
    "ai_questions":     {"free": 3,  "premium": None},
    "ai_quiz":          {"free": 3,  "premium": None},
    "ai_paper":         {"free": 3,  "premium": None},
    "ai_custom":        {"free": 3,  "premium": None},
    "flashcards":       {"free": 3,  "premium": None},
    "revision_plan":    {"free": 1,  "premium": None},
    "ai_chat":          {"free": 5,  "premium": None},
    "mistake_analysis": {"free": 3,  "premium": None},
    "video_watch":      {"free": 5,  "premium": None},
    "quiz_attempt":     {"free": 3,  "premium": None},
    "battle_play":      {"free": 3,  "premium": None},
    "chat_message":     {"free": 50, "premium": None},
    "chat_group_create":{"free": 1,  "premium": None},
    "friend_request":   {"free": 10, "premium": None},
}


class FeatureLimit(Base):
    """Admin-editable daily quota per feature per plan tier. One row per
    feature_key. free_daily_limit/premium_daily_limit = None means
    unlimited for that tier. is_active=False disables enforcement entirely
    for that feature (unlimited for everyone) without deleting the row."""
    __tablename__ = "feature_limits"

    feature_key: Mapped[str] = mapped_column(String(50), primary_key=True)
    free_daily_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    premium_daily_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FeatureUsageLog(Base):
    """One row per (user, feature, date) — durable count of today's usage.
    Upserted (incremented) on each qualifying action; the row's mere
    existence for today is what check_and_log compares against the plan's
    limit. Old rows are never deleted (kept for admin analytics)."""
    __tablename__ = "feature_usage_log"
    __table_args__ = (
        UniqueConstraint("user_id", "feature_key", "usage_date", name="uq_feature_usage_user_feature_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    feature_key: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    usage_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ─── ORM models ───────────────────────────────────────────────────────────────

class UserXP(Base):
    __tablename__ = "user_xp"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    total_xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Season tracking: XP & level reset at each season start
    season_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class XPTransaction(Base):
    __tablename__ = "xp_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    event: Mapped[XPEvent] = mapped_column(Enum(XPEvent), nullable=False)
    xp_awarded: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Partial unique index (reference_id IS NOT NULL only, so events with no
    # natural reference_id aren't constrained by this) — the real backstop
    # against replaying the same (user_id, event, reference_id) award. The
    # service layer also checks before inserting for a clean error message,
    # but this index is what actually prevents a race from double-crediting.
    #
    # QBG-013: scoped to created_at >= the dedup cutover (see
    # alembic/versions/fix_daily_reward_dedup_cutover.py). Historical
    # daily-reward rows written before the claim_date-based reference_id fix
    # can legitimately collide under the old cyclic-day scheme (e.g. the same
    # user claiming "day 1" again on a later streak cycle) and must never be
    # constrained by this index; every row created at/after the cutover uses
    # the fixed scheme and is genuinely unique. This predicate must match the
    # migration exactly, since create_all() (tests, fresh DBs) builds the
    # index from this model, not from the migration.
    __table_args__ = (
        Index(
            "uq_xp_txn_user_event_ref",
            "user_id", "event", "reference_id",
            unique=True,
            postgresql_where=(
                reference_id.isnot(None)
                & (created_at >= DAILY_REWARD_DEDUP_CUTOVER)
            ),
        ),
    )


class UserEduPoints(Base):
    """Permanent spending currency — never resets."""
    __tablename__ = "user_edupoints"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_spent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class EduPointTransaction(Base):
    __tablename__ = "edupoint_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    # For earnings: event is set; for spending: item_key is set
    event: Mapped[str | None] = mapped_column(String(50), nullable=True)
    item_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    points: Mapped[int] = mapped_column(Integer, nullable=False)   # positive = earned, negative = spent
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Dedup backstop for earning rows only (event IS NOT NULL) — spend rows
    # reuse reference_id for an unrelated purpose (e.g. chapter_id) and can
    # legitimately repeat, so they're excluded from this constraint.
    #
    # QBG-013: same created_at cutover as uq_xp_txn_user_event_ref above —
    # see alembic/versions/fix_daily_reward_dedup_cutover.py. Must match the
    # migration exactly.
    __table_args__ = (
        Index(
            "uq_ep_txn_user_event_ref",
            "user_id", "event", "reference_id",
            unique=True,
            postgresql_where=(
                event.isnot(None)
                & reference_id.isnot(None)
                & (created_at >= DAILY_REWARD_DEDUP_CUTOVER)
            ),
        ),
    )


class UserEduPointRedemption(Base):
    """Tracks items a user has unlocked with EduPoints (permanent)."""
    __tablename__ = "edupoint_redemptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    item_key: Mapped[str] = mapped_column(String(50), nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    redeemed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserStreak(Base):
    __tablename__ = "user_streaks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_activity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Streak Freeze — students spend EduPoints to protect their streak
    freeze_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    freeze_used_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class StreakFreeze(Base):
    """Audit log: one row per freeze purchase or auto-use event."""
    __tablename__ = "streak_freezes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    event: Mapped[str] = mapped_column(String(20), nullable=False)  # "purchased" | "used" | "expired"
    cost_ep: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    freeze_count_after: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserBadge(Base):
    __tablename__ = "user_badges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    badge_type: Mapped[BadgeType] = mapped_column(Enum(BadgeType), nullable=False)
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Friend Activity Feed ──────────────────────────────────────────────────────
# Feed-worthy events shown to a user's friends (e.g. "Mohit got 95% in Biology
# Quiz", "Priya won a Battle"). Distinct from XPTransaction, which is an
# internal per-event XP audit log not meant for friend-facing display.

class ActivityType(str, enum.Enum):
    QUIZ_COMPLETED       = "quiz_completed"
    BATTLE_WON           = "battle_won"
    LEVEL_UP             = "level_up"
    BADGE_EARNED         = "badge_earned"
    DAILY_GOAL_COMPLETED = "daily_goal_completed"


class ActivityFeedItem(Base):
    __tablename__ = "activity_feed"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    activity_type: Mapped[ActivityType] = mapped_column(Enum(ActivityType), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)     # e.g. "Biology Quiz", "Level 12", "Battle"
    subject: Mapped[str | None] = mapped_column(String(100), nullable=True)
    score_pct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    xp_earned: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


# ─── Daily Rewards (Day 1-7 login-streak check-in calendar) ──────────────────

# Seed values only — used once to populate RewardCalendarDay on first boot.
# After that, the reward calendar is fully admin-editable in the DB via
# /gamification/admin/reward-calendar (no deploy required to change values).
DAILY_REWARD_SEED: dict[int, dict] = {
    1: {"xp": 10,  "ep": 0,   "label": "10 XP"},
    2: {"xp": 20,  "ep": 0,   "label": "20 XP"},
    3: {"xp": 40,  "ep": 0,   "label": "40 XP"},
    4: {"xp": 60,  "ep": 0,   "label": "60 XP"},
    5: {"xp": 100, "ep": 0,   "label": "100 XP"},
    6: {"xp": 150, "ep": 0,   "label": "150 XP"},
    7: {"xp": 200, "ep": 100, "label": "Premium AI Hint"},
}
DAILY_REWARD_CYCLE_LEN = 7


class RewardCalendarDay(Base):
    """Admin-editable Day 1-7 check-in reward calendar. Seeded once from
    DAILY_REWARD_SEED; every value below is then changeable from the admin
    panel with no code deploy."""
    __tablename__ = "reward_calendar_days"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    day_in_cycle: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)  # 1-7
    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ep: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UserDailyReward(Base):
    """One row per claimed day — powers the Day 1-7 check-in reward calendar.
    The cycle day advances only on consecutive-day claims (like the streak
    system); a missed day resets the cycle back to Day 1."""
    __tablename__ = "user_daily_rewards"
    __table_args__ = (UniqueConstraint("user_id", "claim_date", name="uq_daily_reward_user_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    claim_date: Mapped[date] = mapped_column(Date, nullable=False)
    day_in_cycle: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-7
    xp_awarded: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ep_awarded: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reward_label: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Daily Challenges ─────────────────────────────────────────────────────────

class ChallengeType(str, enum.Enum):
    QUIZ     = "quiz"
    VIDEO    = "video"
    REVISION = "revision"
    PYQ      = "pyq"
    BATTLE   = "battle"


class DailyChallenge(Base):
    """One challenge per day, created by admin or auto-generated."""
    __tablename__ = "daily_challenges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    challenge_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    challenge_type: Mapped[ChallengeType] = mapped_column(Enum(ChallengeType), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    target_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)  # quiz_id, video_id, chapter_id, etc.
    target_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # e.g. 5 questions
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    ep_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserChallengeProgress(Base):
    """Tracks per-user progress/completion of each daily challenge."""
    __tablename__ = "user_challenge_progress"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    challenge_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rewarded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Daily Goal System ────────────────────────────────────────────────────────
# Distinct from DailyChallenge above (one admin-picked GLOBAL challenge per
# day, manually published). This is a personalized-per-user goal: admin
# authors reusable GoalTemplates, and every morning the scheduler assigns
# each active user one (personalized or random) as their UserDailyGoal —
# auto-tracked as the user completes quizzes/videos/practice, auto-rewarded
# on completion, with progress-aware evening reminders if still incomplete.

class GoalType(str, enum.Enum):
    QUIZ              = "quiz"
    VIDEO             = "video"
    QUESTIONS         = "questions"
    PRACTICE_MINUTES  = "practice_minutes"
    AI_DOUBT          = "ai_doubt"
    STREAK            = "streak"


class GoalSlot(str, enum.Enum):
    """The 4 fixed daily slots every active user is assigned, one goal each —
    replaces the old v1 "one random goal/day" behavior. VIDEO is the
    mandatory slot (see GoalService._pick_template's per-slot pool); QUIZ,
    AI_DOUBT and STREAK are the others. A template declares which slot it
    belongs to (GoalTemplate.slot) so _pick_template can draw from the right
    pool. STREAK auto-completes the moment the user opens the app that day
    (see GoalService._create_slot_goal) — no content assignment needed."""
    VIDEO    = "video"
    QUIZ     = "quiz"
    AI_DOUBT = "ai_doubt"
    STREAK   = "streak"


class GoalDifficulty(str, enum.Enum):
    EASY   = "easy"
    MEDIUM = "medium"
    HARD   = "hard"


class GoalTemplate(Base):
    """Admin-authored, reusable goal definition (e.g. "Complete {count} Quiz",
    target_count=1). `{count}` in title_template is interpolated with
    target_count when a UserDailyGoal snapshot is created from it.

    `slot` pins this template to one of the 3 fixed daily slots (video/quiz/
    ai_doubt) — _pick_template draws only from the pool of active templates
    matching a given slot, so admin content authored for one slot never
    displaces another. Defaults to VIDEO for pre-existing rows (safe no-op
    for the mandatory slot, which the migration also backfills explicitly)."""
    __tablename__ = "goal_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slot: Mapped[GoalSlot] = mapped_column(Enum(GoalSlot), nullable=False, default=GoalSlot.VIDEO)
    goal_type: Mapped[GoalType] = mapped_column(Enum(GoalType), nullable=False)
    title_template: Mapped[str] = mapped_column(String(200), nullable=False)
    target_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    ep_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    difficulty: Mapped[GoalDifficulty] = mapped_column(Enum(GoalDifficulty), nullable=False, default=GoalDifficulty.MEDIUM)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserDailyGoal(Base):
    """Auto-generated (or lazily created on first read), per-user, per-day
    goal instance — a personalized snapshot of a GoalTemplate at assignment
    time. All progress/completion/reward state lives here; the frontend
    never computes it.

    A user now gets up to 3 rows per day (one per GoalSlot) instead of the
    old v1 single row — the unique constraint moved from (user_id, goal_date)
    to (user_id, goal_date, slot) to allow that. `assigned_video_ids` /
    `assigned_quiz_id` carry the SPECIFIC content chosen for this user's
    video/quiz slot (personalized by weak-topic + class/board — see
    GoalService._assign_video_slot/_assign_quiz_slot) so the frontend can
    deep-link straight to it instead of "any video/quiz counts"."""
    __tablename__ = "user_daily_goals"
    __table_args__ = (UniqueConstraint("user_id", "goal_date", "slot", name="uq_daily_goal_user_date_slot"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    goal_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    slot: Mapped[GoalSlot] = mapped_column(Enum(GoalSlot), nullable=False, default=GoalSlot.VIDEO)
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    goal_type: Mapped[GoalType] = mapped_column(Enum(GoalType), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    target_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ep_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reward_granted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Personalized content picked at assignment time — nullable/empty for
    # slots where "any" activity of that type counts (kept flexible; not
    # every slot needs a pinned content id).
    assigned_video_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    assigned_quiz_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EngagementConfig(Base):
    """Generic key→JSON settings store for admin-configurable engagement
    toggles (e.g. daily_goal_enabled, daily_goal_personalized,
    battle_reminder_lead_minutes) — new keys can be added without a schema
    change, and every read goes straight to the DB, so changes take effect
    immediately with no redeploy."""
    __tablename__ = "engagement_config"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


ENGAGEMENT_CONFIG_DEFAULTS: dict[str, dict] = {
    "daily_goal_enabled":            {"value": True},
    "daily_goal_personalized":       {"value": False},  # False = random active template; True = weighted by user's weak subjects (best-effort)
    "battle_reminder_lead_minutes":  {"value": 10},
}


# ─── YouTube Subscribe Claims ─────────────────────────────────────────────────

class ClaimStatus(str, enum.Enum):
    PENDING  = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class YoutubeSubscribeClaim(Base):
    """One-per-user claim: user subscribes to YouTube channel and uploads screenshot proof.
    Admin approves → 500 EduPoints awarded automatically."""
    __tablename__ = "youtube_subscribe_claims"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    screenshot_b64: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ClaimStatus] = mapped_column(
        Enum(ClaimStatus, name="claimstatus", create_type=True),
        default=ClaimStatus.PENDING,
        nullable=False,
    )
    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
