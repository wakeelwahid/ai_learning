from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.announcement import AnnouncementType
from app.utils.response import APIResponse, PaginatedData

# Match Announcement model column widths (app/models/announcement.py) so an
# oversized value is rejected with a clean 422 instead of a DB-level 500.
_TITLE_MAX_LEN = 200       # title: String(200)
_URL_MAX_LEN = 500         # link_url / image_url: String(500)
_CREATED_BY_MAX_LEN = 200  # created_by: String(200)


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=_TITLE_MAX_LEN)
    # body's DB column is unbounded Text, but every sibling field here caps
    # to its column width — a 5MB body was accepted with no limit before
    # this (confirmed live), with no real use case needing more than a
    # generous long-form announcement.
    body: str = Field(min_length=1, max_length=20_000)
    type: AnnouncementType = AnnouncementType.GENERAL
    link_url: Optional[str] = Field(default=None, max_length=_URL_MAX_LEN)
    image_url: Optional[str] = Field(default=None, max_length=_URL_MAX_LEN)
    release_date: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_active: bool = True
    is_pinned: bool = False
    created_by: Optional[str] = Field(default=None, max_length=_CREATED_BY_MAX_LEN)


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=_TITLE_MAX_LEN)
    body: Optional[str] = Field(default=None, min_length=1, max_length=20_000)
    type: Optional[AnnouncementType] = None
    link_url: Optional[str] = Field(default=None, max_length=_URL_MAX_LEN)
    image_url: Optional[str] = Field(default=None, max_length=_URL_MAX_LEN)
    release_date: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_active: Optional[bool] = None
    is_pinned: Optional[bool] = None


class AnnouncementResponse(BaseModel):
    id: UUID
    title: str
    body: str
    type: AnnouncementType
    link_url: Optional[str]
    image_url: Optional[str]
    release_date: datetime
    expires_at: Optional[datetime]
    is_active: bool
    is_pinned: bool
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
