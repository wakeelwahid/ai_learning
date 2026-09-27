import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import DeviceSession, RefreshToken


class RefreshTokenRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, **kwargs) -> RefreshToken:
        token = RefreshToken(**kwargs)
        self.db.add(token)
        await self.db.flush()
        return token

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.is_revoked == False,  # noqa: E712
                RefreshToken.expires_at > datetime.now(timezone.utc),
            )
        )
        return result.scalar_one_or_none()

    async def revoke(self, token_hash: str) -> bool:
        """Atomically revoke a not-yet-revoked token. The WHERE clause and
        the write happen in one statement, so two concurrent refresh calls
        for the same token can never both see "not revoked" — only the
        first to commit gets rowcount > 0. Returns whether THIS call was
        the one that revoked it (False means another request already had)."""
        result = await self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == token_hash, RefreshToken.is_revoked == False)  # noqa: E712
            .values(is_revoked=True)
        )
        return result.rowcount > 0

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        await self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id)
            .values(is_revoked=True)
        )


class DeviceSessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, user_id: uuid.UUID, session_id: str, **kwargs) -> "DeviceSession":
        session = DeviceSession(user_id=user_id, session_id=session_id, **kwargs)
        self.db.add(session)
        await self.db.flush()
        return session

    async def get_by_session_id(self, session_id: str) -> "DeviceSession | None":
        result = await self.db.execute(
            select(DeviceSession).where(DeviceSession.session_id == session_id)
        )
        return result.scalar_one_or_none()

    async def get_by_session_id_for_user(self, session_id: str, user_id: uuid.UUID) -> "DeviceSession | None":
        result = await self.db.execute(
            select(DeviceSession).where(
                DeviceSession.session_id == session_id,
                DeviceSession.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_active_for_user(self, user_id: uuid.UUID) -> list:
        result = await self.db.execute(
            select(DeviceSession).where(
                DeviceSession.user_id == user_id,
                DeviceSession.is_active == True,  # noqa: E712
                DeviceSession.revoked_at.is_(None),
            ).order_by(DeviceSession.last_seen.desc())
        )
        return result.scalars().all()

    async def revoke_session(self, session_id: str, user_id: uuid.UUID | None = None) -> bool:
        """Revoke a device session identified by its public `session_id` token.

        When `user_id` is provided, the update is scoped to sessions owned by
        that user (defense in depth against IDOR — the caller-supplied
        `session_id` never revokes another user's session even if a
        higher-layer ownership check is missing or buggy).

        Returns True if a session was actually revoked.
        """
        now = datetime.now(timezone.utc)
        conditions = [DeviceSession.session_id == session_id]
        if user_id is not None:
            conditions.append(DeviceSession.user_id == user_id)
        result = await self.db.execute(
            update(DeviceSession).where(*conditions).values(
                is_active=False,
                revoked_at=now,
            )
        )
        return result.rowcount > 0

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        now = datetime.now(timezone.utc)
        await self.db.execute(
            update(DeviceSession).where(
                DeviceSession.user_id == user_id,
                DeviceSession.revoked_at.is_(None),
            ).values(
                is_active=False,
                revoked_at=now,
            )
        )

    async def touch(self, session_id: str) -> None:
        await self.db.execute(
            update(DeviceSession).where(DeviceSession.session_id == session_id).values(
                last_seen=datetime.now(timezone.utc)
            )
        )
