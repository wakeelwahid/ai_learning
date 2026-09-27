"""Shared outbound email/SMS helpers used by more than one route module.

`fire_email` is the low-level fire-and-forget sender; `fire_reset_email`
builds on it, for the admin app's forgot/reset-password flow. Kept in one
place because the phone-OTP and session route modules both dispatch
through them.
"""
import httpx

from app.core.config import settings


async def fire_email(to_email: str, subject: str, html: str) -> None:
    payload = {
        "user_id": "00000000-0000-0000-0000-000000000000",
        "to_email": to_email,
        "subject": subject,
        "html_body": html,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{settings.NOTIFICATION_SERVICE_URL}/api/v1/notifications/internal/email",
                json=payload,
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        pass


async def send_otp_sms(phone: str, otp: str) -> bool:
    """Synchronous call to notification_service's internal SMS endpoint —
    unlike fire_otp_email (fire-and-forget), the caller needs to know
    immediately whether the SMS actually sent so it can tell the user."""
    message = f"Your EduLearn login code is {otp}. It expires in {settings.OTP_TTL_SECONDS // 60} minutes."
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{settings.NOTIFICATION_SERVICE_URL}/api/v1/notifications/internal/sms",
                json={"phone": phone, "message": message},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code == 200:
            return bool(resp.json().get("sent", False))
    except Exception:
        pass
    return False


async def fire_reset_email(email: str, token: str) -> None:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#4F46E5;">Reset Your Password</h2>
        <p>Click the button below to reset your password. This link expires in 2 hours.</p>
        <a href="{reset_url}"
           style="display:inline-block;background:#DC2626;color:white;padding:12px 28px;
                  text-decoration:none;border-radius:6px;font-weight:bold;">
            Reset Password
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px;">
            If you did not request this, ignore this email.
        </p>
    </div>
    """
    await fire_email(email, "Reset your password — EdTech", html)
