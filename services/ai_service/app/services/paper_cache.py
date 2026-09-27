"""
Paper bank cache (Redis).

Admin-generated papers are cached by board+class+subject+paper_type key.
User requests check Redis first; on a miss, fall back to PostgreSQL and warm
the cache automatically. Admin writes (create/bulk-create) call invalidate()
so the next user request re-populates from the updated DB.
"""
import json

from app.core.config import settings

_TTL = 3600  # 1 hour


def _key(board, class_num, subject, paper_type="any") -> str:
    b = str(board or "any").lower()
    c = str(class_num or "any")
    s = str(subject or "any").lower()
    t = str(paper_type or "any").lower()
    return f"papers:{b}:{c}:{s}:{t}"


async def cache_papers(redis, board, class_num, subject, paper_type, papers: list[dict]) -> None:
    if not redis or not papers:
        return
    key = _key(board, class_num, subject, paper_type)
    await redis.setex(key, _TTL, json.dumps(papers, ensure_ascii=False, default=str))


async def fetch_papers(redis, board, class_num, subject, paper_type) -> list[dict] | None:
    if not redis:
        return None
    key = _key(board, class_num, subject, paper_type)
    raw = await redis.get(key)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


async def invalidate_papers(redis, board, class_num, subject) -> None:
    """Delete all cached paper keys for a board/class/subject combination."""
    if not redis:
        return
    try:
        b = str(board or "any").lower()
        c = str(class_num or "any")
        s = str(subject or "any").lower()
        pattern = f"papers:{b}:{c}:{s}:*"
        keys = [key async for key in redis.scan_iter(match=pattern)]
        if keys:
            await redis.delete(*keys)
    except Exception:
        pass


async def warm(board, class_num, subject, paper_type, papers: list[dict]) -> None:
    """Open a short-lived Redis client and cache papers (best-effort, for workers)."""
    if not papers:
        return
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await cache_papers(r, board, class_num, subject, paper_type, papers)
        await r.aclose()
    except Exception:
        pass
