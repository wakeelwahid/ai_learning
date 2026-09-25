import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.verification import PasswordReset, PhoneOTP


class PhoneOTPRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, **kwargs) -> PhoneOTP:
        otp = PhoneOTP(**kwargs)
        self.db.add(otp)
        await self.db.flush()
        return otp

    async def get_active_for_phone(self, phone: str) -> "PhoneOTP | None":
        result = await self.db.execute(
            select(PhoneOTP).where(
                PhoneOTP.phone == phone,
                PhoneOTP.is_used == False,  # noqa: E712
                PhoneOTP.expires_at > datetime.now(timezone.utc),
            ).order_by(PhoneOTP.created_at.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def mark_used(self, otp_id: uuid.UUID) -> None:
        await self.db.execute(
            update(PhoneOTP).where(PhoneOTP.id == otp_id).values(is_used=True)
        )

    async def revoke_all_for_phone(self, phone: str) -> None:
        await self.db.execute(
            update(PhoneOTP)
            .where(PhoneOTP.phone == phone, PhoneOTP.is_used == False)  # noqa: E712
            .values(is_used=True)
        )


class PasswordResetRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, user_id: uuid.UUID, token_hash: str, expires_at: datetime) -> "PasswordReset":
        record = PasswordReset(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self.db.add(record)
        await self.db.flush()
        return record

    async def get_by_hash(self, token_hash: str) -> "PasswordReset | None":
        result = await self.db.execute(
            select(PasswordReset).where(
                PasswordReset.token_hash == token_hash,
                PasswordReset.is_used == False,  # noqa: E712
                PasswordReset.expires_at > datetime.now(timezone.utc),
            )
        )
        return result.scalar_one_or_none()

    async def mark_used(self, record_id: uuid.UUID) -> None:
        await self.db.execute(update(PasswordReset).where(PasswordReset.id == record_id).values(is_used=True))
