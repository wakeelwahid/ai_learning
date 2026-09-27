import asyncio
import json
import logging
import uuid
from datetime import date, datetime
from typing import Any


class ExtEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_pool: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    return _pool


async def close_redis() -> None:
    global _pool
    if _pool:
        await _pool.aclose()
        _pool = None


# ── Video progress cache helpers ───────────────────────────────────────────────

def progress_key(user_id: str, video_id: str) -> str:
    return f"vp:{user_id}:{video_id}"


async def cache_set_progress(user_id: str, video_id: str, data: dict) -> None:
    """Write-through: cache progress after DB save."""
    try:
        r = get_redis()
        await r.setex(
            progress_key(user_id, video_id),
            settings.VIDEO_PROGRESS_CACHE_TTL,
            json.dumps(data),
        )
    except Exception as exc:
        logger.warning("Redis write failed for vp:%s:%s — %s", user_id, video_id, exc)


async def cache_get_progress(user_id: str, video_id: str) -> dict | None:
    """Read-through: return cached progress or None (caller hits DB)."""
    try:
        r = get_redis()
        raw = await r.get(progress_key(user_id, video_id))
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("Redis read failed for vp:%s:%s — %s", user_id, video_id, exc)
        return None


async def cache_invalidate_progress(user_id: str, video_id: str) -> None:
    try:
        r = get_redis()
        await r.delete(progress_key(user_id, video_id))
    except Exception as exc:
        logger.warning("Redis delete failed for vp:%s:%s — %s", user_id, video_id, exc)


# ── Dirty-set: tracks which progress keys need flushing to PostgreSQL ──────────

DIRTY_SET = "vp:dirty"


async def mark_progress_dirty(user_id: str, video_id: str) -> None:
    """Add a key to the dirty set so the background worker flushes it to DB."""
    try:
        r = get_redis()
        await r.sadd(DIRTY_SET, f"{user_id}:{video_id}")
    except Exception as exc:
        logger.warning("Redis dirty-mark failed — %s", exc)


async def pop_dirty_progress_keys(count: int = 100) -> list[tuple[str, str]]:
    """Atomically pop up to `count` dirty entries. Returns [(user_id, video_id), ...]."""
    try:
        r = get_redis()
        members = await r.spop(DIRTY_SET, count)
        if not members:
            return []
        result = []
        for m in (members if isinstance(members, list) else [members]):
            parts = m.split(":", 1)
            if len(parts) == 2:
                result.append((parts[0], parts[1]))
        return result
    except Exception as exc:
        logger.warning("Redis dirty-pop failed — %s", exc)
        return []


# ── Continue-watching list cache ───────────────────────────────────────────────

def cw_key(user_id: str) -> str:
    return f"cw:{user_id}"


async def cache_set_continue_watching(user_id: str, data: dict) -> None:
    try:
        r = get_redis()
        await r.setex(cw_key(user_id), settings.CONTINUE_WATCHING_CACHE_TTL, json.dumps(data))
    except Exception as exc:
        logger.warning("Redis CW write failed for %s — %s", user_id, exc)


async def cache_get_continue_watching(user_id: str) -> dict | None:
    try:
        r = get_redis()
        raw = await r.get(cw_key(user_id))
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("Redis CW read failed for %s — %s", user_id, exc)
        return None


async def cache_invalidate_continue_watching(user_id: str) -> None:
    try:
        r = get_redis()
        await r.delete(cw_key(user_id))
    except Exception as exc:
        logger.warning("Redis CW delete failed for %s — %s", user_id, exc)


# ── Catalog cache (boards / classes / subjects / chapters / topics / videos) ──
# Phase 17: Redis-first architecture — static catalog data cached 1 hour.
# Phase 22: Per-key asyncio.Lock prevents simultaneous DB fetches for the same key
#           (in-process single-flight; Redis fill then serves all subsequent requests).

# Per-key locks: only one coroutine fetches from DB while others wait for Redis fill.
catalog_locks: dict[str, asyncio.Lock] = {}


async def catalog_get(key: str) -> list | None:
    try:
        r = get_redis()
        raw = await r.get(key)
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("Redis catalog read failed for %s — %s", key, exc)
        return None


async def catalog_set(key: str, data: list, ttl: int | None = None) -> None:
    ttl = ttl if ttl is not None else settings.CATALOG_CACHE_TTL
    try:
        r = get_redis()
        await r.setex(key, ttl, json.dumps(data))
    except Exception as exc:
        logger.warning("Redis catalog write failed for %s — %s", key, exc)


async def catalog_invalidate(prefix: str) -> None:
    """Delete all keys matching prefix:* (used on admin create/update/delete)."""
    try:
        r = get_redis()
        pattern = f"{prefix}*"
        cursor = 0
        while True:
            cursor, keys = await r.scan(cursor, match=pattern, count=100)
            if keys:
                await r.delete(*keys)
            if cursor == 0:
                break
    except Exception as exc:
        logger.warning("Redis catalog invalidate failed for %s — %s", prefix, exc)


def catalog_lock(key: str) -> asyncio.Lock:
    if key not in catalog_locks:
        catalog_locks[key] = asyncio.Lock()
    return catalog_locks[key]


# ── Video feed cache (dashboard / popular / recent) ───────────────────────────

def feed_key(class_num: int | None, board: str | None, subject: str | None, sort: str, limit: int) -> str:
    return f"vfeed:{class_num}:{board}:{subject}:{sort}:{limit}"


async def cache_get_video_feed(
    class_num: int | None, board: str | None, subject: str | None, sort: str, limit: int
) -> dict | None:
    try:
        r = get_redis()
        raw = await r.get(feed_key(class_num, board, subject, sort, limit))
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("Redis feed read failed — %s", exc)
        return None


async def cache_set_video_feed(
    class_num: int | None, board: str | None, subject: str | None, sort: str, limit: int, data: dict
) -> None:
    try:
        r = get_redis()
        await r.setex(feed_key(class_num, board, subject, sort, limit), settings.VIDEO_FEED_CACHE_TTL, json.dumps(data, cls=ExtEncoder))
    except Exception as exc:
        logger.warning("Redis feed write failed — %s", exc)
