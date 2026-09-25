"""
Question bank cache (Redis).

Cache key includes `feature` so quiz / custom / questions each get their own
Redis list and never contaminate each other.
"""
import json
import random

from app.core.config import settings

_TTL = 7 * 86400  # 7 days


def _key(feature: str, board, class_num, subject) -> str:
    f = str(feature or "questions").lower()
    b = str(board or "any").lower()
    c = str(class_num or "any")
    s = str(subject or "any").lower()
    return f"qbank:{f}:{b}:{c}:{s}"


async def cache_questions(redis, feature: str, board, class_num, subject, chapter, questions: list[dict]) -> None:
    if not redis or not questions:
        return
    key = _key(feature, board, class_num, subject)
    pipe = redis.pipeline()
    for q in questions:
        item = {**q, "chapter": (chapter or q.get("chapter"))}
        pipe.rpush(key, json.dumps(item, ensure_ascii=False))
    pipe.ltrim(key, -500, -1)   # keep the most recent 500 per feature+subject
    pipe.expire(key, _TTL)
    await pipe.execute()


async def warm(feature: str, board, class_num, subject, chapter, questions: list[dict]) -> None:
    """Open a short-lived Redis client and cache questions (best-effort, for workers)."""
    if not questions:
        return
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await cache_questions(r, feature, board, class_num, subject, chapter, questions)
        await r.aclose()
    except Exception:
        pass


async def fetch_random(redis, feature: str, board, class_num, subject, chapter, count: int) -> list[dict]:
    if not redis:
        return []
    items = await redis.lrange(_key(feature, board, class_num, subject), 0, -1)
    if not items:
        return []
    qs = []
    for raw in items:
        try:
            qs.append(json.loads(raw))
        except Exception:
            continue
    if chapter:
        ch = chapter.lower()
        filtered = [q for q in qs if str(q.get("chapter") or "").lower() == ch]
        qs = filtered or qs
    random.shuffle(qs)
    return qs[:count]
