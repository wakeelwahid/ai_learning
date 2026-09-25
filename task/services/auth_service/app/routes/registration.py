import logging

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/ping")
async def ping():
    return {"status": "ok", "service": "auth"}


# Email/password registration and email-OTP verification (/register,
# /verify-otp, /resend-otp, /verify-email) have been removed entirely —
# student/parent sign-up is Mobile Number + OTP only (see routes/phone_otp.py),
# which creates the account automatically on first verify. There is no
# remaining path that creates an EmailVerification row, so nothing here
# needs re-enabling. Forgot/reset-password (a separate concern, still used
# by the admin app's email+password login) is untouched — see session.py.
