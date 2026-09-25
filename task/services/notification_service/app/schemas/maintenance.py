from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class MaintenanceSet(BaseModel):
    is_active: bool
    # MaintenanceMode.title is String(200); .updated_by is String(200); .message is unbounded Text.
    title: str = Field(default="Platform Under Maintenance", min_length=1, max_length=200)
    message: str = Field(
        default="We are performing scheduled maintenance to improve your experience. We'll be back soon.",
        min_length=1, max_length=5_000,
    )
    ends_at: Optional[datetime] = None
    updated_by: Optional[str] = Field(default=None, max_length=200)


class MaintenanceResponse(BaseModel):
    is_active: bool
    title: str
    message: str
    ends_at: Optional[datetime]
    updated_by: Optional[str]
    updated_at: datetime

    class Config:
        from_attributes = True
