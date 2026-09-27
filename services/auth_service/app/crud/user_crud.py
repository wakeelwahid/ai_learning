import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_phone(self, phone: str) -> User | None:
        result = await self.db.execute(select(User).where(User.phone == phone))
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> User:
        user = User(**kwargs)
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def update_last_login(self, user_id: uuid.UUID) -> None:
        await self.db.execute(
            update(User).where(User.id == user_id).values(last_login=datetime.now(timezone.utc))
        )

    async def mark_verified(self, user_id: uuid.UUID) -> None:
        await self.db.execute(
            update(User).where(User.id == user_id).values(is_verified=True)
        )

    async def get_by_identifier(self, identifier: str) -> User | None:
        """Lookup by email or phone number."""
        if re.match(r"^\+?[\d\s\-]{7,20}$", identifier):
            return await self.get_by_phone(identifier)
        return await self.get_by_email(identifier)

    async def get_by_google_id(self, google_id: str) -> User | None:
        result = await self.db.execute(select(User).where(User.google_id == google_id))
        return result.scalar_one_or_none()

    async def update_password(self, user_id: uuid.UUID, hashed_password: str) -> None:
        await self.db.execute(
            update(User).where(User.id == user_id).values(hashed_password=hashed_password)
        )

    async def update_social_id(self, user_id: uuid.UUID, provider: str, social_id: str, avatar_url: str | None = None) -> None:
        vals: dict = {provider + "_id": social_id}
        if avatar_url:
            vals["avatar_url"] = avatar_url
        await self.db.execute(update(User).where(User.id == user_id).values(**vals))

    async def update_fields(self, user_id: uuid.UUID, **values) -> None:
        await self.db.execute(update(User).where(User.id == user_id).values(**values))


async def list_users(db: AsyncSession, role: UserRole | None = None, is_active: bool | None = None, page: int = 1, limit: int = 50) -> list[User]:
    q = select(User)
    if role is not None:
        q = q.where(User.role == role)
    if is_active is not None:
        q = q.where(User.is_active == is_active)
    q = q.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()
