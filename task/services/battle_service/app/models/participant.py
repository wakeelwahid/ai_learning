import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Enum, Float, Index, Integer,
    String, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ParticipantStatus(str, enum.Enum):
    INVITED   = "invited"
    JOINED    = "joined"
    READY     = "ready"
    ACTIVE    = "active"
    FINISHED  = "finished"
    LEFT      = "left"


class BattleParticipant(Base):
    __tablename__ = "battle_participants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    battle_id:   Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    user_id:     Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    is_ai:       Mapped[bool]            = mapped_column(Boolean, nullable=False, default=False)
    is_spectator: Mapped[bool]           = mapped_column(Boolean, nullable=False, default=False)
    team:        Mapped[str | None]      = mapped_column(String(10), nullable=True)  # "A" or "B"
    display_name: Mapped[str]            = mapped_column(String(100), nullable=False)
    avatar_url:  Mapped[str | None]      = mapped_column(String(500), nullable=True)
    status:      Mapped[ParticipantStatus] = mapped_column(Enum(ParticipantStatus), nullable=False, default=ParticipantStatus.INVITED)
    score:       Mapped[int]             = mapped_column(Integer, nullable=False, default=0)
    correct:     Mapped[int]             = mapped_column(Integer, nullable=False, default=0)
    wrong:       Mapped[int]             = mapped_column(Integer, nullable=False, default=0)
    accuracy:    Mapped[float]           = mapped_column(Float, nullable=False, default=0.0)
    time_taken_sec: Mapped[int]          = mapped_column(Integer, nullable=False, default=0)
    rank:        Mapped[int | None]      = mapped_column(Integer, nullable=True)
    xp_earned:   Mapped[int]             = mapped_column(Integer, nullable=False, default=0)
    answers:     Mapped[dict | None]     = mapped_column(JSONB, nullable=True, default=dict)
    joined_at:   Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_bp_battle_user", "battle_id", "user_id"),
    )
