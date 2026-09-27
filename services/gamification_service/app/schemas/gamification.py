import uuid
from datetime import date, datetime
from pydantic import BaseModel, Field

from app.models.gamification import ActivityType, ChallengeType, EduPointEvent, EduPointItem, GoalDifficulty, GoalSlot, GoalType, XPEvent


# ─── XP / Level ──────────────────────────────────────────────────────────────

class AwardXPRequest(BaseModel):
    user_id: uuid.UUID
    event: XPEvent
    reference_id: str | None = None


class RecordActivityRequest(BaseModel):
    user_id: uuid.UUID


class XPResponse(BaseModel):
    total_xp: int
    level: int
    xp_to_next_level: int | None = None
    season_start: datetime | None = None
    model_config = {"from_attributes": True}


# ─── EduPoints ───────────────────────────────────────────────────────────────

class AwardEduPointsRequest(BaseModel):
    user_id: uuid.UUID
    event: EduPointEvent
    reference_id: str | None = None


class SpendEduPointsRequest(BaseModel):
    user_id: uuid.UUID
    item: EduPointItem
    reference_id: str | None = None   # e.g. chapter_id for chapter-specific packs


class EduPointsBalanceResponse(BaseModel):
    balance: int
    total_earned: int
    total_spent: int


class EduPointsHistoryEntry(BaseModel):
    id: uuid.UUID
    event: str | None
    item_key: str | None
    points: int
    balance_after: int
    reference_id: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class RedemptionResponse(BaseModel):
    item_key: str
    cost: int
    balance_after: int
    message: str


class ShopItem(BaseModel):
    key: str
    name: str
    cost: int
    category: str
    owned: bool = False


# ─── Streaks / Badges ────────────────────────────────────────────────────────

class StreakResponse(BaseModel):
    current: int
    longest: int


class BadgeResponse(BaseModel):
    type: str
    earned_at: str


# ─── Profile ─────────────────────────────────────────────────────────────────

class GamificationProfileResponse(BaseModel):
    xp: XPResponse
    streak: StreakResponse
    badges: list[BadgeResponse]
    edupoints: EduPointsBalanceResponse
    level_unlocks: list[str]   # features unlocked at current level


# ─── Leaderboard ─────────────────────────────────────────────────────────────

class LeaderboardEntry(BaseModel):
    rank: int
    user_id: str
    total_xp: int
    level: int


# ─── Level info ──────────────────────────────────────────────────────────────

class LevelInfoResponse(BaseModel):
    level: int
    total_xp: int
    xp_to_next_level: int | None
    unlocked_features: list[str]
    next_level_features: list[str]
    progress_percent: float          # 0-100, progress within current level
    season_start: datetime | None = None
    all_unlocks: dict[str, list[str]] = {}  # level_str -> feature list


# ─── Daily Challenges ────────────────────────────────────────────────────────

class DailyChallengeResponse(BaseModel):
    id: uuid.UUID
    challenge_date: date
    challenge_type: ChallengeType
    title: str
    description: str
    target_ref: str | None
    target_count: int
    xp_reward: int
    ep_reward: int
    model_config = {"from_attributes": True}


class ChallengeProgressResponse(BaseModel):
    challenge: DailyChallengeResponse
    progress: int
    target: int
    completed: bool
    rewarded: bool
    completed_at: datetime | None = None


class CreateChallengeRequest(BaseModel):
    challenge_date: date
    challenge_type: ChallengeType
    title: str
    description: str
    # Bounds match the sibling GoalTemplateCreateRequest below — this schema
    # previously had none at all, so an admin typo (or a compromised admin
    # session) could grant an effectively unlimited XP/EP reward to every
    # user who completes the challenge.
    xp_reward: int = Field(default=20, ge=0, le=10_000)
    ep_reward: int = Field(default=10, ge=0, le=10_000)
    target_ref: str | None = None
    target_count: int = Field(default=1, gt=0, le=1000)


class RecordProgressRequest(BaseModel):
    user_id: uuid.UUID
    challenge_id: uuid.UUID
    increment: int = 1


class ClaimRewardRequest(BaseModel):
    user_id: uuid.UUID
    challenge_id: uuid.UUID


# ─── Share Card ──────────────────────────────────────────────────────────────

class ShareCardResponse(BaseModel):
    achievement_type: str
    title: str
    subtitle: str
    icon: str
    gradient_start: str
    gradient_end: str
    referral_code: str | None = None


class ShareEventRequest(BaseModel):
    user_id: uuid.UUID
    achievement_type: str
    platform: str


# ─── YouTube Subscribe Claims ─────────────────────────────────────────────────

class YoutubeClaimSubmit(BaseModel):
    user_id: uuid.UUID
    screenshot_b64: str   # base64-encoded screenshot image

class YoutubeClaimStatus(BaseModel):
    id: uuid.UUID | None = None
    status: str | None = None          # None = no claim yet
    created_at: datetime | None = None
    reviewed_at: datetime | None = None
    review_note: str | None = None
    model_config = {"from_attributes": True}

class YoutubeClaimAdminEntry(YoutubeClaimStatus):
    user_id: uuid.UUID | None = None
    screenshot_b64: str | None = None

class YoutubeClaimReview(BaseModel):
    note: str | None = None


# ─── Misc ─────────────────────────────────────────────────────────────────────

class QueuedResponse(BaseModel):
    queued: bool
    event: str | None = None


# ─── Friend-challenge stake settlement (internal) ─────────────────────────────

class ChallengeResultRequest(BaseModel):
    """Body for the internal POST /internal/challenge-result — called by
    battle_service when a friend-challenge stake battle completes. The stake
    is chosen per battle by the challenger (min 50): winner +stake, loser −stake."""
    winner_user_id: uuid.UUID
    loser_user_id: uuid.UUID
    stake_xp: int = Field(default=50, ge=50, le=500)
    reference_id: str | None = None


class InternalXPApplyRequest(BaseModel):
    """Body for the internal POST /internal/xp/apply — battle_service's
    rank-based XP rewards, which use computed amounts rather than a fixed
    XP_REWARDS event value."""
    user_id: uuid.UUID
    amount: int = Field(ge=-1000, le=1000)
    reference_id: str | None = None


class InternalQuizXPRequest(BaseModel):
    """Body for the internal POST /internal/quiz-xp/award — quiz_service's
    post-completion side effect, so a real quiz submission actually grants
    the QUIZ_COMPLETED/QUIZ_SCORE_80/QUIZ_PERFECT XP defined in XP_REWARDS
    (previously dead: nothing ever called award_xp with these events).
    percentage picks exactly one tier (the highest the score qualifies for,
    not all three cumulatively). reference_id should be the quiz attempt id
    so award_xp's (user_id, event, reference_id) dedup makes a retried
    submit a safe no-op."""
    user_id: uuid.UUID
    percentage: float = Field(ge=0.0, le=100.0)
    reference_id: str = Field(min_length=1, max_length=100)


class InternalReferralRewardRequest(BaseModel):
    """Body for the internal POST /internal/referral-reward — referral_service
    calls this to grant the fixed REFERRAL_SUCCESS XP+EduPoints award, for
    both the referrer (once per qualifying referral) and the referred friend
    (once, on their own first qualifying milestone). reference_id must be
    unique per grant (e.g. the Referral.id) — the underlying award_xp/
    EduPointsService.award calls dedupe on (user_id, event, reference_id),
    so a retried call is a safe no-op rather than a double credit."""
    user_id: uuid.UUID
    reference_id: str = Field(min_length=1, max_length=100)


# ─── Friend Activity Feed ─────────────────────────────────────────────────────

class RecordActivityFeedRequest(BaseModel):
    """Body for the internal, network-gated POST /activity/record — called by
    quiz_service (quiz completion) and battle_service (battle win)."""
    user_id: uuid.UUID
    activity_type: ActivityType
    title: str = Field(min_length=1, max_length=200)
    subject: str | None = Field(default=None, max_length=100)
    score_pct: int | None = Field(default=None, ge=0, le=100)
    xp_earned: int | None = Field(default=None, ge=0)


class ActivityFeedEntry(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    activity_type: ActivityType
    title: str
    subject: str | None
    score_pct: int | None
    xp_earned: int | None
    created_at: datetime
    # Populated by the route (not stored on the model) when resolving friend
    # names/avatars for the feed — None for the "mine" endpoint.
    user_name: str | None = None
    user_avatar: str | None = None
    model_config = {"from_attributes": True}


# ─── Daily Rewards (Day 1-7 check-in calendar) ────────────────────────────────

class DailyRewardDay(BaseModel):
    day: int
    xp: int
    ep: int
    label: str
    claimed: bool


class DailyRewardStatusResponse(BaseModel):
    claimed_today: bool
    current_day: int
    reward: dict
    calendar: list[DailyRewardDay]
    # Popup contract — the backend alone decides whether the client should
    # open the Daily Reward popup, whether Claim is enabled, and how long
    # until the next claim unlocks. Clients render these verbatim.
    can_claim: bool = False
    should_show_popup: bool = False
    current_streak: int = 0
    next_claim_in_seconds: int = 0
    next_reward: dict = {}


class DailyRewardClaimResponse(BaseModel):
    day: int
    xp_awarded: int
    ep_awarded: int
    reward_label: str
    next_day: int
    current_streak: int = 0
    next_claim_in_seconds: int = 0
    next_reward: dict = {}


class RewardCalendarDayUpdate(BaseModel):
    """Admin edit of one Day 1-7 slot — no code deploy required."""
    xp: int = Field(ge=0, le=10_000)
    ep: int = Field(ge=0, le=10_000)
    label: str = Field(min_length=1, max_length=50)


# ─── Daily Goal System ─────────────────────────────────────────────────────────

class GoalTemplateCreateRequest(BaseModel):
    slot: GoalSlot
    goal_type: GoalType
    title_template: str = Field(min_length=1, max_length=200)
    target_count: int = Field(gt=0, le=1000)
    xp_reward: int = Field(ge=0, le=10_000)
    ep_reward: int = Field(ge=0, le=10_000)
    difficulty: GoalDifficulty = GoalDifficulty.MEDIUM
    is_active: bool = True


class GoalTemplateUpdateRequest(BaseModel):
    title_template: str | None = Field(default=None, min_length=1, max_length=200)
    target_count: int | None = Field(default=None, gt=0, le=1000)
    xp_reward: int | None = Field(default=None, ge=0, le=10_000)
    ep_reward: int | None = Field(default=None, ge=0, le=10_000)
    difficulty: GoalDifficulty | None = None
    is_active: bool | None = None


class GoalTemplateResponse(BaseModel):
    id: uuid.UUID
    slot: GoalSlot
    goal_type: GoalType
    title_template: str
    target_count: int
    xp_reward: int
    ep_reward: int
    difficulty: GoalDifficulty
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class UserDailyGoalResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    goal_date: date
    slot: GoalSlot
    goal_type: GoalType
    title: str
    target_count: int
    progress: int
    completed: bool
    completed_at: datetime | None
    xp_reward: int
    ep_reward: int
    assigned_video_ids: list[str] | None = None
    assigned_quiz_id: uuid.UUID | None = None
    model_config = {"from_attributes": True}


class RecordGoalProgressRequest(BaseModel):
    """Internal — called by quiz_service/content_service on a qualifying
    completion event."""
    user_id: uuid.UUID
    goal_type: GoalType
    increment: int = Field(default=1, gt=0, le=1000)


class EngagementConfigUpdateRequest(BaseModel):
    value: bool | int | float | str


# ─── Internal student profile (parent RAG) ────────────────────────────────────

class InternalXPSummary(BaseModel):
    total_xp: int
    level: int


class InternalEduPointsSummary(BaseModel):
    balance: int
    total_earned: int
    total_spent: int


class InternalStreakSummary(BaseModel):
    current_streak: int
    longest_streak: int
    last_activity_date: date | None
    freeze_count: int


class InternalBadgeEntry(BaseModel):
    badge_type: str
    earned_at: datetime


class InternalDailyGoalEntry(BaseModel):
    goal_date: date
    goal_type: GoalType
    title: str
    target_count: int
    progress: int
    completed: bool
    model_config = {"from_attributes": True}


class InternalXPEventEntry(BaseModel):
    event: XPEvent
    xp_awarded: int
    created_at: datetime
    model_config = {"from_attributes": True}


class InternalStudentProfileResponse(BaseModel):
    """Read-only gamification snapshot for the parent RAG indexer. Zeroed
    sections rather than 404 when the student has no rows yet."""
    user_id: uuid.UUID
    xp: InternalXPSummary
    edupoints: InternalEduPointsSummary
    streak: InternalStreakSummary
    badges: list[InternalBadgeEntry]
    daily_goals_recent: list[InternalDailyGoalEntry]
    challenges_completed: int
    recent_xp_events: list[InternalXPEventEntry]
