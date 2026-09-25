import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.referral_code import ReferralCode


class ReferralCodeService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_code(self, user_id: uuid.UUID) -> ReferralCode:
        result = await self.db.execute(
            select(ReferralCode).where(ReferralCode.user_id == user_id)
        )
        code = result.scalar_one_or_none()
        if code:
            return code

        raw = secrets.token_urlsafe(6).upper()[:8]
        code = ReferralCode(user_id=user_id, code=raw)
        self.db.add(code)
        await self.db.commit()
        await self.db.refresh(code)
        return code
