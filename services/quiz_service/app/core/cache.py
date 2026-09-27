"""
Redis cache helpers for quiz_service.

Key schema (all in Redis DB 3):
  questions:{board}:{class}:{subject}:{chapter}   → JSON array of questions       TTL 24h
  quiz:{board}:{class}:{subject}:{chapter}         → JSON quiz object with qs      TTL 24h
  quiz:{quiz_id}                                   → JSON quiz object (by ID)      TTL 24h
  question:{question_id}                           → JSON question metadata        TTL 24h
  popular_questions                                → Sorted set  (qid → views)
  leaderboard:class{n}                             → Sorted set  (user_id → score)
  leaderboard:subject:{board}:{class}:{subject_id}  → Sorted set  (user_id → cumulative score)
  student:{id}:progress                            → JSON progress summary         TTL 1h
  student:{id}:weak_topics                         → JSON list of topic strings    TTL 1h
"""
import json
from typing import Any

from app.core.redis import get_redis

TTL_QUESTIONS = 86_400   # 24 h
TTL_QUIZ      = 86_400   # 24 h
TTL_QUESTION  = 86_400   # 24 h
TTL_PROGRESS  = 3_600    # 1 h


# ── Key builders ──────────────────────────────────────────────────────────────

def slug(s: str) -> str:
    return s.lower().replace(" ", "_")


def questions_key(board: str, class_num: int | str, subject: str, chapter: str) -> str:
    return f"questions:{slug(board)}:{class_num}:{slug(subject)}:{slug(chapter)}"


def quiz_meta_key(board: str, class_num: int | str, subject: str, chapter: str) -> str:
    return f"quiz:{slug(board)}:{class_num}:{slug(subject)}:{slug(chapter)}"


def quiz_id_key(quiz_id: str) -> str:
    return f"quiz:{quiz_id}"


def question_key(question_id: str) -> str:
    return f"question:{question_id}"


def student_progress_key(student_id: str) -> str:
    return f"student:{student_id}:progress"


def student_weak_topics_key(student_id: str) -> str:
    return f"student:{student_id}:weak_topics"


def leaderboard_key(class_num: int | str) -> str:
    return f"leaderboard:class{class_num}"


def subject_leaderboard_key(board: str, class_num: int | str, subject_id: str) -> str:
    """Per-subject, within board+class — e.g. "CBSE Class 10 Physics
    Champions." Board/class are folded into the key (not just subject_id)
    because the same subject name can exist across multiple board+class
    combinations with entirely different question pools."""
    return f"leaderboard:subject:{board.lower()}:{class_num}:{subject_id}"


POPULAR_QUESTIONS_KEY = "popular_questions"


# ── Generic JSON cache ────────────────────────────────────────────────────────

async def cache_get(key: str) -> Any | None:
    r = await get_redis()
    raw = await r.get(key)
    return json.loads(raw) if raw is not None else None


async def cache_set(key: str, value: Any, ttl: int) -> None:
    r = await get_redis()
    await r.set(key, json.dumps(value, default=str), ex=ttl)


async def cache_delete(key: str) -> None:
    r = await get_redis()
    await r.delete(key)


# ── Sorted set helpers ────────────────────────────────────────────────────────

async def zincrby(key: str, member: str, increment: float) -> None:
    r = await get_redis()
    await r.zincrby(key, increment, member)


async def zadd(key: str, member: str, score: float) -> None:
    r = await get_redis()
    await r.zadd(key, {member: score})


async def zrevrange_with_scores(key: str, start: int = 0, stop: int = 9) -> list[tuple[str, float]]:
    r = await get_redis()
    return await r.zrevrange(key, start, stop, withscores=True)


async def zscore(key: str, member: str) -> float | None:
    r = await get_redis()
    return await r.zscore(key, member)


async def zrank(key: str, member: str) -> int | None:
    """0-based rank from highest score (1st place = 0)."""
    r = await get_redis()
    return await r.zrevrank(key, member)
