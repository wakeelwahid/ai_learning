from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ParticipantOut(BaseModel):
    user_id:      str | None
    display_name: str
    avatar_url:   str | None
    is_ai:        bool
    score:        int
    correct:      int
    wrong:        int
    accuracy:     float
    rank:         int | None
    xp_earned:    int
    status:       str

    model_config = {"from_attributes": True}


class BattleOut(BaseModel):
    id:             str
    battle_type:    str
    status:         str
    subject:        str | None
    topic:          str | None
    board:          str | None
    class_num:      int | None
    difficulty:     str
    question_count: int
    time_limit_sec: int
    max_players:    int
    invite_code:    str | None
    participants:   list[ParticipantOut] = []
    current_question_idx: int = 0
    started_at:     datetime | None
    ended_at:       datetime | None
    created_at:     datetime

    model_config = {"from_attributes": True}


class BattleResultOut(BaseModel):
    battle_id:    str
    battle_type:  str
    subject:      str | None
    winners:      list[ParticipantOut]
    participants: list[ParticipantOut]
    xp_awarded:   dict[str, int]
    duration_sec: int


class BattleStatsOut(BaseModel):
    user_id:         str
    battles_played:  int
    battles_won:     int
    win_rate:        float
    total_score:     int
    total_xp_earned: int
    win_streak:      int
    best_win_streak: int

    model_config = {"from_attributes": True}


class StudentSummaryStats(BaseModel):
    battles_played:  int
    battles_won:     int
    total_score:     int
    total_xp_earned: int
    win_streak:      int
    best_win_streak: int


class StudentSummaryBattle(BaseModel):
    battle_id:   str
    subject:     str | None
    topic:       str | None
    difficulty:  str | None
    class_num:   int | None
    score:       int
    correct:     int
    wrong:       int
    accuracy:    float
    rank:        int | None
    xp_earned:   int
    time_taken_sec: int
    participant_count: int
    won:         bool
    ended_at:    datetime | None


class StudentSummarySubject(BaseModel):
    subject:      str
    played:       int
    won:          int
    avg_accuracy: float


class StudentSummaryOut(BaseModel):
    user_id:    str
    stats:      StudentSummaryStats
    recent:     list[StudentSummaryBattle]
    by_subject: list[StudentSummarySubject]


class BattleHistoryEntry(BaseModel):
    battle_id:   str
    battle_type: str
    subject:     str | None
    difficulty:  str
    score:       int
    rank:        int | None
    xp_earned:   int
    result:      Literal["won", "lost", "draw"]
    played_at:   datetime

    model_config = {"from_attributes": True}
