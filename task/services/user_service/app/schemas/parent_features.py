import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


# ── Purchase approvals (F1) ───────────────────────────────────────────────────

class ApprovalParent(BaseModel):
    parent_user_id: uuid.UUID
    parent_name: str | None = None


class ApprovalRequiredResponse(BaseModel):
    required: bool
    parents: list[ApprovalParent]


class ParentApprovalCreate(BaseModel):
    kind: Literal["purchase"] = "purchase"
    reference: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    amount: float | None = Field(default=None, ge=0, le=99_999_999)


class ParentApprovalDecide(BaseModel):
    status: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=1000)


class ParentApprovalResponse(BaseModel):
    id: uuid.UUID
    student_user_id: uuid.UUID
    parent_user_id: uuid.UUID
    kind: str
    reference: str
    title: str
    amount: float | None = None
    status: str
    note: str | None = None
    created_at: datetime
    decided_at: datetime | None = None
    student_name: str | None = None
    parent_name: str | None = None
    model_config = {"from_attributes": True}


class PurchaseApprovalCheck(BaseModel):
    required: bool
    approved: bool


class PurchaseApprovalConsume(BaseModel):
    student_id: uuid.UUID
    reference: str = Field(min_length=1, max_length=100)


# ── Badges (F4) ───────────────────────────────────────────────────────────────

class LinkBadgesResponse(BaseModel):
    pending_incoming: int
    pending_outgoing: int
    pending_approvals: int


# ── Meetings (F8) ─────────────────────────────────────────────────────────────

MeetingStatus = Literal["pending", "confirmed", "declined", "completed", "cancelled"]


class MeetingCreate(BaseModel):
    student_user_id: uuid.UUID
    preferred_at: datetime
    topic: str = Field(min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("topic")
    @classmethod
    def _strip_topic(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("topic must not be blank")
        return v


class MeetingAdminUpdate(BaseModel):
    status: Literal["confirmed", "declined", "completed"] | None = None
    scheduled_at: datetime | None = None
    meeting_link: str | None = Field(default=None, max_length=500)
    admin_note: str | None = Field(default=None, max_length=2000)


class MeetingResponse(BaseModel):
    id: uuid.UUID
    parent_user_id: uuid.UUID
    student_user_id: uuid.UUID
    preferred_at: datetime
    topic: str
    notes: str | None = None
    status: str
    scheduled_at: datetime | None = None
    meeting_link: str | None = None
    admin_note: str | None = None
    created_at: datetime
    updated_at: datetime
    student_name: str | None = None
    parent_name: str | None = None
    model_config = {"from_attributes": True}
