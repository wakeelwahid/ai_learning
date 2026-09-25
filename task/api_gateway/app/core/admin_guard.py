"""Admin-only guard for gateway-native routes (ones with no backing service
to enforce require_admin itself — every proxied route already gets this for
free from the service it forwards to; see rest_router.py's docstring).

Mirrors the verify+cache pattern every backend service already uses against
auth_service's /api/v1/auth/verify, with the same 60s Redis TTL, so a burst
of admin dashboard polling doesn't hammer auth_service on every request.
Fails closed: any auth_service error, timeout, or non-200 denies access.
"""
import hashlib

import httpx
import redis.asyncio as aioredis
from fastapi import HTTPException, Request, status

from app.config import settings

_redis: aioredis.Redis | None = None
_CACHE_TTL = 60


async def _get_redis() -> aioredis.Redis | None:
    global _redis
    if _redis is not None:
        return _redis
    try:
        _redis = aioredis.from_url(
            settings.REDIS_URL, encoding="utf-8", decode_responses=True,
            socket_connect_timeout=1, socket_timeout=1,
        )
        await _redis.ping()
        return _redis
    except Exception:
        _redis = None
        return None


def _cache_key(token: str) -> str:
    return f"gw:adminverify:{hashlib.sha256(token.encode()).hexdigest()}"


async def require_admin(request: Request) -> None:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = auth_header[len("Bearer "):]

    redis = await _get_redis()
    cache_key = _cache_key(token)
    if redis is not None:
        cached_role = await redis.get(cache_key)
        if cached_role is not None:
            if cached_role not in ("admin", "super_admin"):
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
            return

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.AUTH_SERVICE_URL}/api/v1/auth/verify",
                headers={"Authorization": auth_header},
            )
    except httpx.RequestError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Auth service unreachable")

    if resp.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    role = resp.json().get("role", "")
    if redis is not None:
        await redis.set(cache_key, role, ex=_CACHE_TTL)

    if role not in ("admin", "super_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
