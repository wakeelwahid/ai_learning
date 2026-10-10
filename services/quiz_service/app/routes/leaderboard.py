import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.cache import (
    cache_get,
    leaderboard_key,
    student_progress_key,
    student_weak_topics_key,
    subject_leaderboard_key,
    zrank,
    zrevrange_with_scores,
)
from app.core.dependencies import get_current_user_id, get_current_user_id_and_role, require_internal
from app.core.redis import get_redis
from app.schemas.leaderboard import LeaderboardEntry, LeaderboardResponse, SubjectLeaderboardResponse

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


@router.get("/internal/leaderboard-rank/{student_id}", dependencies=[Depends(require_internal)])
async def internal_leaderboard_rank(
    student_id: uuid.UUID,
    class_num: int | None = Query(default=None, ge=1, le=12),
):
    """[internal] {rank, total, class_num} for a student in the class
    leaderboard, or all-null when they appear in none. The profile class is
    tried first; leaderboards are keyed by the QUIZ's class_num, which can
    differ from the profile (e.g. a student practising another class's
    quizzes), so every class is scanned as a fallback — 12 O(log n) Redis ops."""
    member = str(student_id)
    candidates = ([class_num] if class_num else []) + [c for c in range(1, 13) if c != class_num]
    r = await get_redis()
    for c in candidates:
        rank = await zrank(leaderboard_key(c), member)
        if rank is not None:
            total = await r.zcard(leaderboard_key(c))
            return {"student_id": member, "class_num": c, "rank": rank + 1, "total": total}
    return {"student_id": member, "class_num": None, "rank": None, "total": None}


@router.get("/leaderboard/{class_num}", response_model=LeaderboardResponse,
            dependencies=[Depends(get_current_user_id)])
async def get_leaderboard(class_num: int, top: int = Query(default=10, ge=1, le=100)):
    """Top students for a class from Redis sorted set. Requires login — the
    entries expose student_ids, which an anonymous caller could otherwise
    enumerate to harvest the whole student roster."""
    entries_raw = await zrevrange_with_scores(leaderboard_key(class_num), 0, top - 1)
    entries = [
        LeaderboardEntry(rank=i + 1, student_id=uid, score=round(score, 2))
        for i, (uid, score) in enumerate(entries_raw)
    ]
    return LeaderboardResponse(class_num=class_num, entries=entries)


@router.get("/leaderboard/subject/{board}/{class_num}/{subject_id}", response_model=SubjectLeaderboardResponse,
            dependencies=[Depends(get_current_user_id)])
async def get_subject_leaderboard(
    board: str,
    class_num: int,
    subject_id: uuid.UUID,
    top: int = Query(default=20, ge=1, le=100),
):
    """Top students for ONE subject within one board+class — e.g. "CBSE
    Class 10 Physics Champions" — ranked by cumulative quiz percentage in
    that subject specifically, not overall XP or an all-subjects blend.
    Scores accumulate from real submit_quiz/batch_submit calls (see
    AttemptService._update_redis_after_submit); there is no separate write
    path to keep in sync."""
    key = subject_leaderboard_key(board, class_num, str(subject_id))
    entries_raw = await zrevrange_with_scores(key, 0, top - 1)
    entries = [
        LeaderboardEntry(rank=i + 1, student_id=uid, score=round(score, 2))
        for i, (uid, score) in enumerate(entries_raw)
    ]
    return SubjectLeaderboardResponse(board=board, class_num=class_num, subject_id=str(subject_id), entries=entries)


def require_self_or_admin(student_id: uuid.UUID, caller: tuple[uuid.UUID, str]) -> None:
    caller_id, role = caller
    if student_id != caller_id and role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized to view this student's data")


@router.get("/student/{student_id}/progress")
async def get_student_progress(
    student_id: uuid.UUID,
    caller: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
):
    """Student progress summary from Redis."""
    require_self_or_admin(student_id, caller)
    data = await cache_get(student_progress_key(str(student_id)))
    return data or {"completed_chapters": 0, "completed_videos": 0, "completed_quizzes": 0, "xp": 0}


@router.get("/student/{student_id}/weak-topics")
async def get_student_weak_topics(
    student_id: uuid.UUID,
    caller: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
):
    """Student weak topics list from Redis."""
    require_self_or_admin(student_id, caller)
    data = await cache_get(student_weak_topics_key(str(student_id)))
    return {"weak_topics": data or []}
