import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class BattleStats(Base):
    __tablename__ = "battle_stats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:       Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    battles_played: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    battles_won:    Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_score:    Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_xp_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    win_streak:     Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    best_win_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
