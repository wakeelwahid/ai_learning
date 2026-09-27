"""CRUD helpers for the PushToken model."""
import uuid

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.push_token import PushToken


async def upsert_token(
    db: AsyncSession, user_id: uuid.UUID, token: str, platform: str, device_id: str | None = None,
) -> None:
    # Keyed on (user_id, device_id) — see models/push_token.py's docstring
    # for why this replaced the old (user_id, platform) key. A caller that
    # doesn't send a real device_id falls back to the token itself, which
    # still upserts correctly for a single device but won't dedupe a token
    # rotation the way a real per-install id would.
    resolved_device_id = device_id or token
    await db.execute(
        text("""
            INSERT INTO push_tokens (id, user_id, token, platform, device_id)
            VALUES (:id, :uid, :token, :platform, :device_id)
            ON CONFLICT (user_id, device_id) DO UPDATE SET
                token = EXCLUDED.token, platform = EXCLUDED.platform, updated_at = NOW()
        """),
        {"id": str(uuid.uuid4()), "uid": str(user_id), "token": token,
         "platform": platform, "device_id": resolved_device_id},
    )
    await db.commit()


async def get_tokens_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[PushToken]:
    result = await db.execute(select(PushToken).where(PushToken.user_id == user_id))
    return result.scalars().all()


async def delete_token(db: AsyncSession, user_id: uuid.UUID, device_id: str) -> bool:
    """Remove one device's token (e.g. on logout or explicit device removal).
    Scoped to the caller's own user_id — never lets a caller delete another
    user's token by guessing a device_id."""
    result = await db.execute(
        text("DELETE FROM push_tokens WHERE user_id = :uid AND device_id = :device_id"),
        {"uid": str(user_id), "device_id": device_id},
    )
    await db.commit()
    return result.rowcount > 0
