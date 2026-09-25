from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ForbiddenError
from app.core.redis import clear_otp_attempts, get_otp_attempts, increment_otp_attempts
from app.core.security import generate_otp
from app.models.user import UserRole
from app.crud.user_crud import UserRepository
from app.crud.verification_crud import PhoneOTPRepository
from app.schemas.phone_otp import PhoneLoginResponse
from app.schemas.session import TokenResponse
from app.services.session_service import SessionService


class PhoneOTPService:
    """Phone-OTP login for students AND parents. A brand-new phone gets an
    account with role=PENDING; the client shows a Student/Parent picker and
    calls PATCH /auth/role exactly once to set the real role (see
    RoleService.set_role) before profile completion. An existing phone always
    logs into its own account, unaffected by any of this."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.phone_otp_repo = PhoneOTPRepository(db)
        self.sessions = SessionService(db)

    async def create_session(self, user, user_agent: str | None = None, ip_address: str | None = None) -> TokenResponse:
        """Delegates to SessionService — kept on this class because the
        internal test-token route mints a session straight off this service."""
        return await self.sessions.create_session(user, user_agent=user_agent, ip_address=ip_address)

    async def send_phone_otp(self, phone: str) -> str:
        """Generate and store an OTP for this phone number. Returns the raw
        OTP for the caller to dispatch via SMS — never returns it to the
        client directly (see routes/phone_otp.py, matches the email-OTP pattern
        where the route layer owns delivery, not the service)."""
        await self.phone_otp_repo.revoke_all_for_phone(phone)
        otp = generate_otp()
        await self.phone_otp_repo.create(
            phone=phone,
            code=otp,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.OTP_TTL_SECONDS),
        )
        await self.db.commit()
        return otp

    async def verify_phone_otp(
        self,
        phone: str,
        otp: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> PhoneLoginResponse:
        """Verify the OTP; log in the existing account for this phone, or
        create a brand-new one with role=PENDING (role choice is deferred to
        a separate PATCH /auth/role call — see class docstring). Uses the
        same Redis attempt-lockout counter pattern as email OTP, keyed by
        phone instead of user_id since the user may not exist yet at attempt
        time."""
        attempt_key = f"phone:{phone}"
        current_attempts = await get_otp_attempts(attempt_key)
        if current_attempts >= settings.OTP_MAX_ATTEMPTS:
            raise HTTPException(
                status_code=429,
                detail={"code": "otp_locked", "message": "Too many incorrect attempts. Please request a new OTP."},
            )

        record = await self.phone_otp_repo.get_active_for_phone(phone)
        # Dev-only static test code: this environment has no real Twilio
        # credentials configured, so no SMS is ever actually delivered — the
        # real generated OTP still exists in `phone_otps` and is the only
        # code that works unless ALL THREE conditions below hold. Every
        # value read here is a server-side setting only — never a request
        # header, query param, client-claimed environment, phone number, or
        # user role, so a client can never talk its way into this branch.
        #   (a) settings.APP_ENV == "development" — strict literal-string
        #       equality, not settings.DEBUG, not a bool, not "staging" or
        #       "dev", not case-insensitive. This must fail safe: a missing,
        #       unset, or mistyped APP_ENV (e.g. "Development") compares
        #       unequal and keeps the bypass OFF, per APP_ENV's own
        #       fail-safe default of "production" in config.py.
        #   (b) bool(settings.DEV_OTP_CODE) — must be non-empty. Without
        #       this guard, an empty/unset DEV_OTP_CODE ("") would equal an
        #       empty otp string and accidentally let a blank OTP through.
        #   (c) otp == settings.DEV_OTP_CODE — the actual code match.
        is_debug_test_code = (
            settings.APP_ENV == "development"
            and bool(settings.DEV_OTP_CODE)
            and otp == settings.DEV_OTP_CODE
        )
        if not is_debug_test_code and (not record or record.code != otp):
            new_count = await increment_otp_attempts(attempt_key)
            remaining = max(0, settings.OTP_MAX_ATTEMPTS - new_count)
            if remaining == 0:
                raise HTTPException(
                    status_code=429,
                    detail={"code": "otp_locked", "message": "Too many incorrect attempts. Please request a new OTP."},
                )
            raise HTTPException(
                status_code=401,
                detail={
                    "code": "invalid_otp",
                    "message": f"Invalid or expired OTP. {remaining} attempt{'s' if remaining != 1 else ''} remaining.",
                },
            )

        await clear_otp_attempts(attempt_key)
        if record:
            await self.phone_otp_repo.mark_used(record.id)

        user = await self.user_repo.get_by_phone(phone)
        is_new_user = user is None
        if user is None:
            user = await self.user_repo.create(
                phone=phone,
                phone_verified=True,
                hashed_password=None,
                role=UserRole.PENDING,
                is_verified=True,
                terms_accepted=True,
                terms_accepted_at=datetime.now(timezone.utc),
            )
        elif not user.phone_verified:
            await self.user_repo.update_fields(user.id, phone_verified=True)

        if not user.is_active:
            raise ForbiddenError("Account is deactivated")

        await self.db.commit()
        tokens = await self.sessions.create_session(user, user_agent=user_agent, ip_address=ip_address)

        return PhoneLoginResponse(
            **tokens.model_dump(),
            is_new_user=is_new_user,
            profile_complete=False,  # caller (route layer) fills in the real value via user_service
        )
