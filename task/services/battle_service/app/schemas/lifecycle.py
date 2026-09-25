import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.battle import BattleType


class CreateBattleRequest(BaseModel):
    # Reuse the real BattleType enum (app/models/battle.py) instead of a bare
    # Literal[...] duplicating its values, so schema and DB stay in lockstep.
    battle_type:    BattleType = BattleType.SOLO
    subject:        str | None = Field(default=None, max_length=100)
    topic:          str | None = Field(default=None, max_length=200)
    board:          str | None = Field(default=None, max_length=50)
    class_num:      int | None = Field(default=None, ge=1, le=12)
    difficulty:     Literal["easy", "medium", "hard"] = "medium"
    question_count: int = Field(default=10, ge=5, le=30)
    time_limit_sec: int = Field(default=300, ge=60, le=900)
    max_players:    int = Field(default=2, ge=2, le=100)
    # Team battle
    team_a_name:    str | None = Field(default=None, max_length=100)
    team_b_name:    str | None = Field(default=None, max_length=100)
    # Class/School
    class_a:        str | None = Field(default=None, max_length=100)
    class_b:        str | None = Field(default=None, max_length=100)
    school_a:       str | None = Field(default=None, max_length=200)
    school_b:       str | None = Field(default=None, max_length=200)
    # Scheduled battles (Battle Reminder) — optional future start time.
    # Omit/None for the default "immediate" battle behavior.
    scheduled_at:   datetime | None = None


class JoinBattleRequest(BaseModel):
    invite_code: str = Field(min_length=6, max_length=8)
    display_name: str | None = Field(default=None, max_length=100)


class ChallengeFriendRequest(BaseModel):
    """Growth Dashboard 'Challenge Friend': one-shot private 1v1 vs an
    ACCEPTED friend (friendship enforced server-side in the route).
    Defaults mirror the product spec: 5 questions in 5 minutes."""
    friend_id:      uuid.UUID
    subject:        str | None = Field(default=None, max_length=100)
    topic:          str | None = Field(default=None, max_length=200)
    class_num:      int | None = Field(default=None, ge=1, le=12)
    difficulty:     Literal["easy", "medium", "hard"] = "medium"
    # question_count is DERIVED server-side from time_limit_sec for challenges
    # (10 min → 7 Q, 20 min → 15 Q, 30 min → 20 Q); kept for API compat only.
    question_count: int = Field(default=5, ge=3, le=20)
    # Student-selectable timer: 10/20/30 min in the challenge UI. Default
    # must stay under 600s (the 10-min→7Q threshold below) to match the
    # class docstring's "5 questions in 5 minutes" default.
    time_limit_sec: int = Field(default=300, ge=60, le=1800)
    # XP stake, chosen by the challenger — winner takes it, loser pays it.
    # Both players must hold at least this much XP (server-enforced).
    stake_xp: int = Field(default=50, ge=50, le=500)
