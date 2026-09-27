import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.models.chat import ReportStatus, ReportTargetType, RequestStatus

REPORT_REASONS = (
    "harassment", "hate_speech", "bullying", "spam",
    "inappropriate_content", "cheating", "impersonation", "other",
)


class SendFriendRequestBody(BaseModel):
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID


class UpdateRequestBody(BaseModel):
    status: RequestStatus
    user_id: uuid.UUID


class CreateGroupBody(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    room_name: Optional[str] = Field(default=None, max_length=100)
    created_by: uuid.UUID
    member_ids: list[uuid.UUID]

    @model_validator(mode="after")
    def resolve_name(self) -> "CreateGroupBody":
        # Accept either 'name' (mobile) or 'room_name' (web frontend)
        if not self.name and self.room_name:
            self.name = self.room_name
        if not self.name:
            raise ValueError("Either 'name' or 'room_name' must be provided")
        return self


class AddMemberBody(BaseModel):
    user_id: uuid.UUID
    added_by: uuid.UUID


class SendMessageBody(BaseModel):
    sender_id: uuid.UUID
    content: str
    reply_to_id: Optional[uuid.UUID] = None


class MarkReadBody(BaseModel):
    user_id: uuid.UUID
    last_message_id: Optional[uuid.UUID] = None


class ReactBody(BaseModel):
    user_id: uuid.UUID
    emoji: str = Field(max_length=10)


class RenameGroupBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CreateReportBody(BaseModel):
    target_type: ReportTargetType
    target_user_id: uuid.UUID
    target_ref_id: Optional[uuid.UUID] = None
    reason: str
    details: Optional[str] = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_reason(self) -> "CreateReportBody":
        if self.reason not in REPORT_REASONS:
            raise ValueError(f"reason must be one of: {', '.join(REPORT_REASONS)}")
        return self


class ReportResponse(BaseModel):
    id: uuid.UUID
    reporter_id: uuid.UUID
    target_type: ReportTargetType
    target_user_id: uuid.UUID
    target_ref_id: Optional[uuid.UUID]
    reason: str
    details: Optional[str]
    content_snapshot: Optional[str]
    status: ReportStatus
    resolved_by: Optional[uuid.UUID]
    resolution_action: Optional[str]
    resolution_note: Optional[str]
    resolved_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class ResolveReportBody(BaseModel):
    action: str = Field(description="dismiss | warn | mute | deactivate")
    note: Optional[str] = Field(default=None, max_length=1000)
    mute_hours: Optional[int] = Field(default=None, ge=1, le=720)

    @model_validator(mode="after")
    def validate_action(self) -> "ResolveReportBody":
        if self.action not in ("dismiss", "warn", "mute", "deactivate"):
            raise ValueError("action must be one of: dismiss, warn, mute, deactivate")
        if self.action == "mute" and not self.mute_hours:
            raise ValueError("mute_hours is required when action is 'mute'")
        return self
