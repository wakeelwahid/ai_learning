"""Schemas for user career goals."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.career_catalog import CareerListItem


class SetGoalRequest(BaseModel):
    career_id:  uuid.UUID
    is_primary: bool = False
    notes:      str | None = Field(default=None, max_length=1000)


class CareerGoalOut(BaseModel):
    id:         str
    user_id:    str
    career_id:  str
    career:     CareerListItem | None = None
    progress:   float
    is_primary: bool
    notes:      str | None
    created_at: datetime

    model_config = {"from_attributes": True}
