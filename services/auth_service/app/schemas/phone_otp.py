from pydantic import BaseModel, Field, field_validator

from app.core.phone import normalize_phone
from app.schemas.common import PHONE_PATTERN
from app.schemas.session import TokenResponse


class SendPhoneOTPRequest(BaseModel):
    phone: str = Field(pattern=PHONE_PATTERN, description="Mobile number, e.g. +919876543210")

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: str) -> str:
        return normalize_phone(v)


class VerifyPhoneOTPRequest(BaseModel):
    phone: str = Field(pattern=PHONE_PATTERN)
    otp: str = Field(min_length=6, max_length=6)

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: str) -> str:
        return normalize_phone(v)


class PhoneOTPSentResponse(BaseModel):
    sent: bool
    expires_in_seconds: int


class PhoneLoginResponse(TokenResponse):
    """Same token pair as a normal login, plus whether this phone number is
    brand new (frontend routes new users straight to profile completion)."""
    is_new_user: bool
    profile_complete: bool
