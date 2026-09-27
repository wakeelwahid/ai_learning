import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime, Enum, Index, Integer,
    String, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class BattleType(str, enum.Enum):
    SOLO          = "solo"         # student vs AI
    ONE_V_ONE     = "1v1"          # two students (private)
    GROUP         = "group"        # 3-20 students (private)
    PUBLIC        = "public"       # open to anyone
    CLASS_BATTLE  = "class_battle" # class vs class
    SCHOOL_BATTLE = "school_battle"# school vs school
    SUBJECT       = "subject"      # subject-themed open
    CHAPTER       = "chapter"      # chapter-specific
    TEAM          = "team"         # team A vs team B
    STUDY_PARTY   = "study_party"  # multi-phase: lobby → watch → discuss → quiz


class BattleStatus(str, enum.Enum):
    WAITING    = "waiting"    # waiting for players
    STARTING   = "starting"   # countdown
    ACTIVE     = "active"     # in progress
    COMPLETED  = "completed"
    CANCELLED  = "cancelled"
    ABANDONED  = "abandoned"


class Battle(Base):
    __tablename__ = "battles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    battle_type:   Mapped[BattleType]   = mapped_column(Enum(BattleType), nullable=False)
    status:        Mapped[BattleStatus] = mapped_column(Enum(BattleStatus), nullable=False, default=BattleStatus.WAITING)
    subject:       Mapped[str | None]   = mapped_column(String(100), nullable=True)
    topic:         Mapped[str | None]   = mapped_column(String(200), nullable=True)
    board:         Mapped[str | None]   = mapped_column(String(50),  nullable=True)
    class_num:     Mapped[int | None]   = mapped_column(Integer, nullable=True)
    difficulty:    Mapped[str]          = mapped_column(String(20), nullable=False, default="medium")
    question_count: Mapped[int]         = mapped_column(Integer, nullable=False, default=10)
    time_limit_sec: Mapped[int]         = mapped_column(Integer, nullable=False, default=300)
    max_players:    Mapped[int]         = mapped_column(Integer, nullable=False, default=2)
    invite_code:    Mapped[str | None]  = mapped_column(String(8), nullable=True, unique=True, index=True)
    host_user_id:   Mapped[uuid.UUID]   = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    questions:      Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Team battle fields
    team_a_name:    Mapped[str | None]  = mapped_column(String(100), nullable=True)
    team_b_name:    Mapped[str | None]  = mapped_column(String(100), nullable=True)
    team_a_score:   Mapped[int]         = mapped_column(Integer, nullable=False, default=0)
    team_b_score:   Mapped[int]         = mapped_column(Integer, nullable=False, default=0)
    # Class/School battle
    class_a:        Mapped[str | None]  = mapped_column(String(100), nullable=True)
    class_b:        Mapped[str | None]  = mapped_column(String(100), nullable=True)
    school_a:       Mapped[str | None]  = mapped_column(String(200), nullable=True)
    school_b:       Mapped[str | None]  = mapped_column(String(200), nullable=True)
    # Spectator / public
    spectator_count: Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    share_code:     Mapped[str | None]  = mapped_column(String(12), nullable=True, index=True)
    # Friend-challenge stake: XP the loser forfeits (winner gets a fixed reward
    # via gamification's CHALLENGE_WIN event). 0 = normal battle, no stake.
    stake_xp:       Mapped[int]         = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Scheduled battles (Battle Reminder feature) — a battle created with a
    # future scheduled_at sits in WAITING until that time; a scheduler polls
    # /battles/starting-soon and reminds joined participants ~10 min before.
    # reminder_sent_at guards against re-notifying on every poll tick.
    scheduled_at:    Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at:     Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at:       Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:     Mapped[datetime]    = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_battles_status_type", "status", "battle_type"),
        Index("ix_battles_created_at", "created_at"),
    )
