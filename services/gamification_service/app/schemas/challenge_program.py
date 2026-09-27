"""Schemas for the multi-day Challenge Programs feature.

Kept in a separate file from schemas/gamification.py (which already holds
the unrelated DailyChallenge schemas) to avoid name collisions and keep the
two features' request/response shapes clearly separated.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.challenge_program import ChallengeProgramStatus, ChallengeTaskType, EnrollmentStatus


# ── Admin: authoring ────────────────────────────────────────────────────────

class CreateChallengeProgramRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    cover_image_url: str | None = Field(default=None, max_length=512)
    duration_days: int = Field(gt=0, le=90)
    badge_type: str | None = None  # validated against BadgeType at the route/service layer
    completion_xp: int = Field(default=0, ge=0, le=10_000)
    completion_ep: int = Field(default=0, ge=0, le=10_000)


class UpdateChallengeProgramRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    cover_image_url: str | None = Field(default=None, max_length=512)
    badge_type: str | None = None
    completion_xp: int | None = Field(default=None, ge=0, le=10_000)
    completion_ep: int | None = Field(default=None, ge=0, le=10_000)


class AddChallengeDayRequest(BaseModel):
    day_number: int = Field(gt=0, le=90)
    title: str | None = Field(default=None, max_length=200)


class AddChallengeTaskRequest(BaseModel):
    task_type: ChallengeTaskType
    content_ref: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    is_required: bool = True
    sequence: int = Field(default=0, ge=0, le=1000)
    xp_reward: int = Field(default=0, ge=0, le=10_000)
    ep_reward: int = Field(default=0, ge=0, le=10_000)


class UpdateChallengeTaskRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    is_required: bool | None = None
    sequence: int | None = Field(default=None, ge=0, le=1000)
    xp_reward: int | None = Field(default=None, ge=0, le=10_000)
    ep_reward: int | None = Field(default=None, ge=0, le=10_000)


# ── Response shapes ──────────────────────────────────────────────────────────

class ChallengeTaskResponse(BaseModel):
    id: uuid.UUID
    task_type: ChallengeTaskType
    content_ref: str
    title: str
    is_required: bool
    sequence: int
    xp_reward: int
    ep_reward: int
    model_config = {"from_attributes": True}


class ChallengeDayResponse(BaseModel):
    id: uuid.UUID
    day_number: int
    title: str | None
    tasks: list[ChallengeTaskResponse] = []
    model_config = {"from_attributes": True}


class ChallengeProgramResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    cover_image_url: str | None
    duration_days: int
    status: ChallengeProgramStatus
    badge_type: str | None
    completion_xp: int
    completion_ep: int
    created_by: uuid.UUID
    created_at: datetime
    published_at: datetime | None
    participant_count: int = 0
    days: list[ChallengeDayResponse] = []
    model_config = {"from_attributes": True}


class ChallengeTaskProgressResponse(BaseModel):
    task_id: uuid.UUID
    is_completed: bool
    completed_at: datetime | None


class ChallengeDayProgressResponse(BaseModel):
    day_number: int
    title: str | None
    is_unlocked: bool
    tasks: list[ChallengeTaskResponse]
    task_progress: list[ChallengeTaskProgressResponse]


class EnrollmentProgressResponse(BaseModel):
    program: ChallengeProgramResponse
    status: EnrollmentStatus
    current_day: int
    joined_at: datetime
    completed_at: datetime | None
    days: list[ChallengeDayProgressResponse]


# ── Internal (service-to-service) ───────────────────────────────────────────

class InternalTaskProgressRequest(BaseModel):
    user_id: uuid.UUID
    task_content_ref: str = Field(min_length=1, max_length=100)
    # None means "match any task_type with this content_ref" — used by
    # quiz_service, since a Quiz row backs both "quiz" and "practice" task
    # types and the caller has no reliable way to know which label an
    # admin picked at authoring time.
    task_type: ChallengeTaskType | None = None
