import uuid

from pydantic import BaseModel, Field


class RegisterReferralRequest(BaseModel):
    # Codes are generated as secrets.token_urlsafe(6).upper()[:8] (<= 8 chars)
    # and stored in a String(20) column — cap input to the column length.
    referral_code: str = Field(min_length=1, max_length=20)
    referred_user_id: uuid.UUID


class QualificationUpdateRequest(BaseModel):
    # No email_verified/video_watched/quiz_completed fields here — those were
    # previously client-supplied booleans trusted as-is, letting any caller
    # qualify their own referral (and trigger a real reward payout) without
    # ever watching a video or completing a quiz. update_qualification() now
    # re-derives all three server-side; the client only says WHICH referral
    # to re-check, never what its qualification state is.
    referred_user_id: uuid.UUID
