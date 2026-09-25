import uuid
from typing import List

from pydantic import BaseModel, Field


class RecordTopicAttemptRequest(BaseModel):
    user_id: uuid.UUID
    topic_id: uuid.UUID
    correct: bool | None = None
    score: int | None = Field(default=None, ge=0, le=100_000)
    total: int | None = Field(default=None, ge=0, le=100_000)

    def model_post_init(self, __context) -> None:
        if self.correct is None:
            if self.score is not None and self.total:
                self.correct = self.score >= (self.total * 0.6)
            else:
                self.correct = False


class WeakTopicItem(BaseModel):
    topic_id: str
    accuracy: float
    attempts: int


class WeakTopicsResponse(BaseModel):
    weak_topics: List[WeakTopicItem]
