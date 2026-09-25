import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedError
from app.core.security import hash_password, hash_token
from app.crud.user_crud import UserRepository
from app.crud.verification_crud import PasswordResetRepository


class RegistrationService:
    """Forgot/reset-password for email+password accounts (admin app login —
    the only account type that still authenticates by email+password;
    student/parent sign-up is Mobile Number + OTP only, see phone_otp.py)."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.reset_repo = PasswordResetRepository(db)

    # ── Forgot / Reset Password ───────────────────────────────────────────────

    async def forgot_password(self, email: str) -> str | None:
        """Returns raw reset token (caller sends email). Returns None if user not found (silent)."""
        user = await self.user_repo.get_by_email(email)
        if not user:
            return None

        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_token(raw_token)
        await self.reset_repo.create(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        )
        await self.db.commit()
        return raw_token

    async def reset_password(self, token: str, new_password: str) -> None:
        token_hash = hash_token(token)
        record = await self.reset_repo.get_by_hash(token_hash)
        if not record:
            raise UnauthorizedError("Invalid or expired reset token")

        await self.reset_repo.mark_used(record.id)
        await self.user_repo.update_password(record.user_id, hash_password(new_password))
        await self.db.commit()
