import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.phone import normalize_phone
from app.models.user import UserRole
from app.schemas.common import PHONE_PATTERN


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str | None = None  # null for a phone-only account (see /auth/otp/*)
    phone: str | None
    phone_verified: bool = False
    full_name: str | None = None
    school_name: str | None = None
    role: UserRole
    is_active: bool
    is_verified: bool
    avatar_url: str | None = None
    google_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenVerifyResponse(BaseModel):
    """Minimal identity payload returned to OTHER services calling
    GET /api/v1/auth/verify to authenticate a request — deliberately excludes
    email/phone/name and other PII that other services don't need just to
    make an authorization decision."""

    user_id: uuid.UUID
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class UpdateAuthProfileRequest(BaseModel):
    phone: str | None = Field(None, pattern=PHONE_PATTERN)
    # Real values are always a server-generated URL from user_service's
    # avatar-upload endpoint — a plain str with no format check accepted
    # arbitrary junk text (confirmed live) that would later render as a
    # broken/stored-junk <img src>.
    avatar_url: str | None = Field(None, max_length=500, pattern=r"^https?://\S+$")
    full_name: str | None = Field(None, max_length=255)
    school_name: str | None = Field(None, max_length=255)

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: str | None) -> str | None:
        return normalize_phone(v) if v is not None else v


class SetRoleRequest(BaseModel):
    """Role choice for a brand-new phone-OTP account. Only student/parent are
    accepted here — teacher/admin/super_admin are never self-service."""
    role: UserRole = Field(..., description="Must be 'student' or 'parent'.")


class UpdateUserRequest(BaseModel):
    is_active: bool | None = None
    role: UserRole | None = None


class CreateTeacherRequest(BaseModel):
    """Admin-only teacher account creation — teachers have no self-service
    sign-up path (role-select only offers student/parent). The created
    account logs in via the existing phone-OTP flow, same as any student/
    parent account; it is never given a password (email/password login is
    hardcoded admin-only in SessionService.login)."""
    phone: str = Field(pattern=PHONE_PATTERN, description="Mobile number, e.g. +919876543210")
    full_name: str = Field(min_length=1, max_length=255)
    email: str | None = Field(None, max_length=255)
    school_name: str | None = Field(None, max_length=255)

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: str) -> str:
        return normalize_phone(v)
