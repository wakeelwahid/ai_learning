import uuid

from pydantic import BaseModel, Field


class SubmitAnswerRequest(BaseModel):
    battle_id:   uuid.UUID
    question_idx: int = Field(ge=0)
    answer:      str = Field(max_length=500)
    time_taken_ms: int = Field(default=0, ge=0, le=3_600_000)


class BattleQuestion(BaseModel):
    idx:      int
    text:     str
    options:  list[str]
    subject:  str | None = None
    topic:    str | None = None


# WebSocket message types
class WSMessage(BaseModel):
    type: str
    payload: dict = {}
