"""Schemas for skill gap analysis."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class SkillGapRequest(BaseModel):
    career_id:          uuid.UUID
    student_scores:     dict[str, float] = Field(
        default_factory=dict,
        description="subject → percentage score, e.g. {'mathematics': 78, 'physics': 65}"
    )

    @field_validator("student_scores")
    @classmethod
    def _validate_scores(cls, v: dict[str, float]) -> dict[str, float]:
        for subject, score in v.items():
            if not subject or len(subject) > 100:
                raise ValueError(f"Invalid subject name: {subject!r}")
            if not (0 <= score <= 100):
                raise ValueError(f"Score for {subject!r} must be between 0 and 100")
        return v


class SkillGapOut(BaseModel):
    career_id:       str
    career_title:    str
    ready_score:     float
    skill_scores:    dict
    gaps:            list[dict]
    recommendations: list[str]
    learning_path:   list[dict]
    assessed_at:     datetime

    model_config = {"from_attributes": True}
