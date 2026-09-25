"""Conversation history and long-term user context, kept in Redis.

Two things are stored per conversation:
  - the last N exchanges, so a follow-up like "why is that?" makes sense;
  - a short rolling summary of what this user keeps asking about, so the
    assistant still knows them after the history window has scrolled past.

Both live in a SEPARATE Redis database from the caches. The shared instance
runs `maxmemory-policy allkeys-lru`, so anything in the cache keyspace can be
evicted without warning — fine for a cached answer, not fine for a parent's
conversation. Keeping history on its own db index means routine cache churn
does not touch it. The memory budget is still shared, so this is isolation by
keyspace rather than a hard guarantee.

Every function here fails soft: if Redis is unreachable the chat still works,
it just forgets. Losing memory must never cost the user their answer.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

# One exchange is a user message plus the assistant's reply.
_ENTRIES_PER_EXCHANGE = 2
# A single pasted essay should not be able to fill the history budget.
_MAX_CONTENT_CHARS = 4000

_client: aioredis.Redis | None = None


async def get_chat_redis() -> aioredis.Redis | None:
    """The history connection. None if Redis is unavailable — callers degrade."""
    global _client
    if _client is not None:
        return _client
    try:
        client = aioredis.from_url(settings.chat_redis_url, decode_responses=True, socket_timeout=2)
        await client.ping()
        _client = client
        return _client
    except Exception as exc:
        logger.warning("Chat history Redis unavailable: %s", exc)
        return None


def parent_scope(student_id) -> str:
    """A parent gets one thread per child — asking about Rahul must never
    surface what was said about Pooja."""
    return f"parent:{student_id}"


STUDENT_SCOPE = "student"


def _history_key(scope: str, user_id) -> str:
    return f"chat:{scope}:{user_id}"


def _summary_key(scope: str, user_id) -> str:
    return f"chat_summary:{scope}:{user_id}"


def _turns_key(scope: str, user_id) -> str:
    return f"chat_turns:{scope}:{user_id}"


async def load_history(scope: str, user_id, limit: int | None = None) -> list[dict]:
    """The last `limit` exchanges, oldest first, ready to put in a prompt."""
    redis = await get_chat_redis()
    if redis is None:
        return []
    limit = limit or settings.CHAT_HISTORY_EXCHANGES
    try:
        raw = await redis.lrange(_history_key(scope, user_id), -limit * _ENTRIES_PER_EXCHANGE, -1)
    except Exception as exc:
        logger.warning("load_history failed: %s", exc)
        return []

    out = []
    for item in raw:
        try:
            entry = json.loads(item)
        except json.JSONDecodeError:
            continue
        if entry.get("role") and entry.get("content"):
            out.append({"role": entry["role"], "content": entry["content"]})
    return out


async def append_exchange(scope: str, user_id, user_msg: str, assistant_msg: str) -> int:
    """Store one exchange and trim to the window. Returns the exchange count
    so the caller can decide whether to refresh the summary."""
    redis = await get_chat_redis()
    if redis is None:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    entries = [
        json.dumps({"role": "user", "content": user_msg[:_MAX_CONTENT_CHARS], "ts": now}),
        json.dumps({"role": "assistant", "content": assistant_msg[:_MAX_CONTENT_CHARS], "ts": now}),
    ]
    key = _history_key(scope, user_id)
    ttl = settings.CHAT_HISTORY_TTL_DAYS * 86400
    keep = settings.CHAT_HISTORY_EXCHANGES * _ENTRIES_PER_EXCHANGE
    try:
        pipe = redis.pipeline()
        pipe.rpush(key, *entries)
        pipe.ltrim(key, -keep, -1)          # keep only the newest N exchanges
        pipe.expire(key, ttl)
        pipe.incr(_turns_key(scope, user_id))
        pipe.expire(_turns_key(scope, user_id), ttl)
        results = await pipe.execute()
        return int(results[-2] or 0)
    except Exception as exc:
        logger.warning("append_exchange failed: %s", exc)
        return 0


async def load_summary(scope: str, user_id) -> str | None:
    redis = await get_chat_redis()
    if redis is None:
        return None
    try:
        return await redis.get(_summary_key(scope, user_id))
    except Exception:
        return None


async def save_summary(scope: str, user_id, summary: str) -> None:
    redis = await get_chat_redis()
    if redis is None:
        return
    try:
        await redis.setex(
            _summary_key(scope, user_id),
            settings.CHAT_HISTORY_TTL_DAYS * 86400,
            summary[:600],
        )
    except Exception as exc:
        logger.warning("save_summary failed: %s", exc)


async def clear(scope: str, user_id) -> None:
    """Backs the "clear chat" action — forget this conversation entirely."""
    redis = await get_chat_redis()
    if redis is None:
        return
    try:
        await redis.delete(
            _history_key(scope, user_id),
            _summary_key(scope, user_id),
            _turns_key(scope, user_id),
        )
    except Exception as exc:
        logger.warning("clear failed: %s", exc)


def format_for_prompt(history: list[dict], summary: str | None) -> str:
    """Render memory for the prompt. Empty string when there is nothing to say,
    so a first-time conversation carries no dead headings."""
    parts = []
    if summary:
        parts.append(f"WHAT YOU ALREADY KNOW ABOUT THIS USER:\n{summary}")
    if history:
        turns = "\n".join(
            f"{'Parent/Student' if h['role'] == 'user' else 'You'}: {h['content']}"
            for h in history
        )
        parts.append(f"EARLIER IN THIS CONVERSATION:\n{turns}")
    return "\n\n".join(parts)


SUMMARY_PROMPT = """Write 2-3 short sentences describing what this user cares about,
based on the conversation below.

Record only their interests and concerns — which subjects they keep asking about
and what worries them.

Do NOT record scores, counts or statistics: those change daily and are supplied
fresh every time. Do NOT record which language they write in: the assistant
matches each question's own language, and a note here would wrongly fix the
language of every future reply.

Write it as notes to yourself, plain sentences, no preamble and no bullet points."""


async def refresh_summary(scope: str, user_id) -> None:
    """Rebuild the rolling summary. Runs in the background — never inline, or
    the user waits on a second LLM call to get their first answer."""
    from app.services import llm_service      # local: avoids an import cycle

    history = await load_history(scope, user_id, limit=settings.CHAT_HISTORY_EXCHANGES)
    if len(history) < 2:
        return
    convo = "\n".join(f"{h['role']}: {h['content']}" for h in history)
    previous = await load_summary(scope, user_id)
    if previous:
        convo = f"Previous notes: {previous}\n\nRecent conversation:\n{convo}"
    try:
        summary, _ = await llm_service.generate(SUMMARY_PROMPT, convo, max_tokens=200)
    except Exception as exc:
        logger.warning("refresh_summary failed for %s/%s: %s", scope, user_id, exc)
        return
    await save_summary(scope, user_id, summary.strip())
