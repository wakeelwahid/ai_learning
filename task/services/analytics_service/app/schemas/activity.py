import uuid
from datetime import date

from pydantic import BaseModel, Field


class InternalActivityRequest(BaseModel):
    """Upsert-increment: counters are ADDED to today's row, logged_in is OR-ed."""

    user_id: uuid.UUID
    day: date | None = None
    study_minutes: int = Field(default=0, ge=0, le=1440)
    videos_watched: int = Field(default=0, ge=0, le=1000)
    quizzes_completed: int = Field(default=0, ge=0, le=1000)
    logged_in: bool = False


class ActivityTodayResponse(BaseModel):
    study_minutes: int
    videos_watched: int
    quizzes_completed: int
    logged_in: bool


class ActivityDayResponse(ActivityTodayResponse):
    day: str


class HeartbeatRequest(BaseModel):
    minutes: int = Field(ge=1, le=5)


class HeartbeatResponse(BaseModel):
    used_today_minutes: int
