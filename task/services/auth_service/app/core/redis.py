"""Redis client used for access-token JTI blacklisting and refresh-token fast-revoke."""
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.core.config import settings

redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
        )
    return redis_client


async def close_redis() -> None:
    global redis_client
    if redis_client is not None:
        await redis_client.aclose()
        redis_client = None


async def blacklist_jti(jti: str, expires_at: datetime) -> None:
    """Add an access-token JTI to the blacklist until its natural expiry."""
    try:
        r = await get_redis()
        ttl = max(1, int((expires_at - datetime.now(timezone.utc)).total_seconds()))
        await r.setex(f"jti_bl:{jti}", ttl, "1")
    except Exception:
        pass  # Redis unavailable — fail open (token remains valid until exp)


async def is_jti_blacklisted(jti: str) -> bool:
    """Return True if the JTI has been explicitly revoked."""
    try:
        r = await get_redis()
        return bool(await r.exists(f"jti_bl:{jti}"))
    except Exception:
        return False  # Redis unavailable — fail open


async def increment_otp_attempts(user_id: str) -> int:
    """Increment OTP attempt counter. Returns new count. TTL matches OTP expiry."""
    try:
        r = await get_redis()
        key = f"otp_attempts:{user_id}"
        count = await r.incr(key)
        if count == 1:
            await r.expire(key, settings.OTP_TTL_SECONDS)
        return count
    except Exception:
        return 0  # Redis unavailable — fail open (don't block)


async def get_otp_attempts(user_id: str) -> int:
    try:
        r = await get_redis()
        val = await r.get(f"otp_attempts:{user_id}")
        return int(val) if val else 0
    except Exception:
        return 0


async def clear_otp_attempts(user_id: str) -> None:
    try:
        r = await get_redis()
        await r.delete(f"otp_attempts:{user_id}")
    except Exception:
        pass
