import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.session import get_db
from app.routes._email import send_otp_sms
from app.routes._profile_check import check_profile_complete
from app.schemas.phone_otp import (
    PhoneLoginResponse,
    PhoneOTPSentResponse,
    SendPhoneOTPRequest,
    VerifyPhoneOTPRequest,
)
from app.services.phone_otp_service import PhoneOTPService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Phone OTP login (students AND parents) ────────────────────────────────────

@router.post("/otp/send", response_model=PhoneOTPSentResponse)
async def send_phone_otp(body: SendPhoneOTPRequest, db: AsyncSession = Depends(get_db)):
    """Send a 6-digit login OTP via SMS to this phone number. Works for both
    brand-new and existing accounts — verify_phone_otp decides which."""
    service = PhoneOTPService(db)
    otp = await service.send_phone_otp(body.phone)
    sent = await send_otp_sms(body.phone, otp)
    if not sent and settings.APP_ENV != "development":
        raise HTTPException(
            status_code=503,
            detail="Could not send the SMS right now. Please try again in a moment.",
        )
    # APP_ENV == "development" only: no SMS provider is configured in local
    # dev, but the OTP row is already saved — let the client proceed to the
    # verify step so the DEV_OTP_CODE path in verify_phone_otp is reachable.
    # Gated on APP_ENV (same fail-safe literal-string check as the OTP
    # bypass itself), never on DEBUG — DEBUG is unrelated to auth/OTP flow.
    # In any other APP_ENV, a real send failure still 503s above, unchanged.
    return PhoneOTPSentResponse(sent=sent, expires_in_seconds=settings.OTP_TTL_SECONDS)


@router.post("/otp/verify", response_model=PhoneLoginResponse)
async def verify_phone_otp(
    body: VerifyPhoneOTPRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Verify the SMS OTP. Logs into the existing account for this phone, or
    creates a new one with role=PENDING — the client shows a Student/Parent
    picker after this call (when `is_new_user` is true) and calls
    PATCH /auth/role exactly once to set the real role, before profile
    completion. The response's `profile_complete` tells the frontend whether
    to route to Dashboard or the mandatory profile-completion screen — this is
    a real check against user_service, not a client-side guess. (Role is no
    longer taken as a query param here: it used to be settable at verify time,
    which silently committed a brand-new user to whatever role the client
    happened to send, before they'd made any real choice.)"""
    service = PhoneOTPService(db)
    result = await service.verify_phone_otp(
        body.phone, body.otp,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    user = await service.user_repo.get_by_phone(body.phone)
    profile_complete = await check_profile_complete(user.id, user.role) if user else False
    return PhoneLoginResponse(**{**result.model_dump(), "profile_complete": profile_complete})
