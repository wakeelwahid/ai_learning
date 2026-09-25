"""Multi-day Challenge Programs — e.g. "7-Day Maths Challenge".

Distinct from DailyChallenge/UserChallengeProgress in gamification.py (one
GLOBAL, single-task, admin-picked challenge per calendar day, no
sequencing). A ChallengeProgram is admin-authored, has N days, each day has
an ordered list of tasks referencing real content in other services
(video/quiz/practice/battle/study_session), and students explicitly join
one and progress through it day by day. Names deliberately avoid the
already-taken `Challenge`/`UserChallengeProgress` identifiers.

RBAC (enforced in app/routes/challenge_programs.py, not here):
  - Admin/Super Admin: full CRUD + lifecycle (create/edit/publish/unpublish/
    archive/delete) + analytics.
  - Teacher: zero access — simply never granted a route, same as every
    other admin-only surface in this service.
  - Student: view published programs, join, view own progress. Task
    completion is NEVER a student-callable "mark complete" action — it can
    only advance via the internal cross-service trigger endpoint
    (POST /gamification/challenge-programs/internal/task-progress), called
    server-to-server by content_service/quiz_service/battle_service/
    analytics_service on a REAL completion event, mirroring how referral
    qualification is driven entirely by server-verified facts rather than
    a client-asserted flag.

Cross-service references (content_ref) are bare strings, matching
DailyChallenge.target_ref's existing convention — no FK, no ORM
relationship, consistent with every other cross-service reference in this
service (see ActivityFeedItem.user_id, UserChallengeProgress.challenge_id).
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.gamification import BadgeType


class ChallengeProgramStatus(str, enum.Enum):
    DRAFT     = "draft"
    PUBLISHED = "published"
    ARCHIVED  = "archived"


class EnrollmentStatus(str, enum.Enum):
    ACTIVE    = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class ChallengeTaskType(str, enum.Enum):
    VIDEO         = "video"
    QUIZ          = "quiz"
    PRACTICE      = "practice"
    BATTLE        = "battle"
    STUDY_SESSION = "study_session"


class ChallengeProgram(Base):
    __tablename__ = "challenge_programs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[ChallengeProgramStatus] = mapped_column(
        Enum(ChallengeProgramStatus), nullable=False, default=ChallengeProgramStatus.DRAFT,
    )
    # Awarded once, when a student finishes every required task on every day.
    badge_type: Mapped[BadgeType | None] = mapped_column(Enum(BadgeType), nullable=True)
    completion_xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_ep: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ChallengeDay(Base):
    __tablename__ = "challenge_days"
    __table_args__ = (UniqueConstraint("program_id", "day_number", name="uq_challenge_day_program_number"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    program_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChallengeTask(Base):
    __tablename__ = "challenge_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    day_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    task_type: Mapped[ChallengeTaskType] = mapped_column(Enum(ChallengeTaskType), nullable=False)
    # The video_id/quiz_id/battle_id/revision_session_id in the OWNING
    # service, as a string — never a typed FK (that service's DB is not
    # this service's DB). Denormalized `title` lets the UI render the task
    # list without a live cross-service fetch just to show a label.
    content_ref: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ep_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserChallengeEnrollment(Base):
    __tablename__ = "user_challenge_enrollments"
    __table_args__ = (UniqueConstraint("user_id", "program_id", name="uq_enrollment_user_program"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    program_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[EnrollmentStatus] = mapped_column(Enum(EnrollmentStatus), nullable=False, default=EnrollmentStatus.ACTIVE)
    current_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserChallengeTaskProgress(Base):
    __tablename__ = "user_challenge_task_progress"
    __table_args__ = (UniqueConstraint("user_id", "task_id", name="uq_task_progress_user_task"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Dedup guards so a retried internal trigger can never double-award —
    # same idea as DailyChallenge.rewarded, checked before calling
    # award_xp/EduPointsService.award (which also dedupe on
    # (user_id, event, reference_id) as a second backstop).
    xp_awarded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ep_awarded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
