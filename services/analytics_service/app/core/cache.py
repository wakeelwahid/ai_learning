"""
Redis cache helpers for analytics_service (Redis DB 7).

Key schema:
  student:{id}:dashboard       → JSON DashboardResponse          TTL 30 min
  student:{id}:performance     → JSON subject performance map     TTL 1 h
  student:{id}:weak_topics     → JSON list of WeakTopicItem       TTL 1 h
  student:{id}:recommended     → JSON list of question_ids        TTL 6 h
  student:{id}:subject_scores  → JSON list of per-subject scores  TTL 30 min
  student:{id}:weekly_summary  → JSON WeeklySummaryResponse        TTL 5 min
  student:{id}:parent_summary  → JSON ParentStudentSummaryResponse TTL 30 min
  admin:overview               → JSON AdminOverviewResponse        TTL 10 min
  admin:engagement              → JSON AdminEngagementResponse      TTL 10 min
  teacher:cohort:{board}:{cls} → JSON CohortResponse               TTL 10 min
  leaderboard:class{n}         → Sorted set  user_id → cum score  no TTL
"""
import json
from typing import Any

from app.core.redis import get_redis

TTL_DASHBOARD       = 1_800   # 30 min — refreshes quickly after quiz activity
TTL_PERFORMANCE     = 3_600   # 1 h
TTL_RECOMMENDED     = 21_600  # 6 h
TTL_SUBJECT_SCORES  = 1_800   # 30 min — same freshness bar as the dashboard
                               # it's grouped alongside; invalidated together
TTL_WEEKLY_SUMMARY  = 300     # 5 min — short, since this embeds a live
                               # gamification_service snapshot (xp/level/
                               # streak/rank) that changes with every battle/
                               # quiz, not just progress-write events
TTL_PARENT_SUMMARY  = 1_800   # 30 min — same freshness bar as the dashboard
                               # it's built from; invalidated on the same
                               # progress-write events (see progress_writer.py)
TTL_ADMIN           = 600     # 10 min — admin/teacher aggregates don't need
                               # per-request freshness, just bounded staleness


# ── Key builders ──────────────────────────────────────────────────────────────

def dashboard_key(student_id: str) -> str:
    return f"student:{student_id}:dashboard"


def performance_key(student_id: str) -> str:
    return f"student:{student_id}:performance"


def weak_topics_key(student_id: str) -> str:
    return f"student:{student_id}:weak_topics"


def recommended_key(student_id: str) -> str:
    return f"student:{student_id}:recommended"


def subject_scores_key(student_id: str) -> str:
    return f"student:{student_id}:subject_scores"


def weekly_summary_key(student_id: str) -> str:
    return f"student:{student_id}:weekly_summary"


def parent_summary_key(student_id: str, days: int) -> str:
    return f"student:{student_id}:parent_summary:{days}"


def admin_overview_key() -> str:
    return "admin:overview"


def admin_engagement_key(days: int) -> str:
    return f"admin:engagement:{days}"


def teacher_cohort_key(board: str, class_num: int) -> str:
    return f"teacher:cohort:{board}:{class_num}"


def leaderboard_key(class_num: int | str) -> str:
    return f"leaderboard:class{class_num}"


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


async def zrevrange_with_scores(key: str, start: int = 0, stop: int = 9) -> list[tuple[str, float]]:
    r = await get_redis()
    return await r.zrevrange(key, start, stop, withscores=True)


async def zrevrank(key: str, member: str) -> int | None:
    r = await get_redis()
    return await r.zrevrank(key, member)
