import uuid
from typing import List

from pydantic import BaseModel, Field


class PerformanceUpdateRequest(BaseModel):
    """Admin-only push of per-subject performance into the Redis cache.

    Explicit allowlist replacing a previously-untyped `dict` body — mirrors
    the fixed shape returned by GET /student/{user_id}/performance.
    """

    overall_score: float = Field(ge=0, le=100)
    physics_accuracy: float = Field(ge=0, le=100)
    chemistry_accuracy: float = Field(ge=0, le=100)
    math_accuracy: float = Field(ge=0, le=100)


class RecommendedQuestionsUpdateRequest(BaseModel):
    """Admin-only push of recommended question IDs into the Redis cache.

    Explicit allowlist replacing a previously-untyped `dict` body.
    """

    questions: List[uuid.UUID] = Field(default_factory=list, max_length=200)


class SubjectPerformanceResponse(BaseModel):
    """Shape of the Redis-cached per-subject accuracy blob quiz_service
    writes after every batch-submit. All-zero default when the cache key
    doesn't exist yet (a student who hasn't taken a quiz), not a fake value —
    genuinely zero attempts recorded."""

    overall_score: float = 0
    physics_accuracy: float = 0
    chemistry_accuracy: float = 0
    math_accuracy: float = 0


class UpdatedResponse(BaseModel):
    updated: bool


class RecommendedUpdatedResponse(BaseModel):
    updated: bool
    count: int


class RecommendedQuestionsResponse(BaseModel):
    recommended_questions: List[str] = Field(default_factory=list)
