import uuid
from typing import List, Literal

from pydantic import BaseModel, Field


class StartRevisionSessionRequest(BaseModel):
    """No user_id — the session always belongs to the authenticated caller."""

    topic_id: uuid.UUID | None = None
    subject_id: uuid.UUID | None = None
    source: Literal["weak_topics", "chapter", "manual"] = "weak_topics"


class UpdateRevisionSessionRequest(BaseModel):
    duration_sec: int = Field(default=0, ge=0, le=86400)
    is_completed: bool = False


class RevisionSessionResponse(BaseModel):
    id: str
    topic_id: str | None
    subject_id: str | None
    source: str
    duration_sec: int
    is_completed: bool
    started_at: str | None
    completed_at: str | None


class RevisionSessionTotals(BaseModel):
    sessions: int
    completed: int
    total_minutes: int
    topics_revised: int


class StudentRevisionSessionsResponse(BaseModel):
    user_id: str
    sessions: List[RevisionSessionResponse]
    totals: RevisionSessionTotals
