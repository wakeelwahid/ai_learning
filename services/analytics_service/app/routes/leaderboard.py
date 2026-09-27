import uuid

from app.core.dependencies import get_current_user_id
from fastapi import APIRouter, Depends, Path, Query

from app.core.cache import (
    leaderboard_key,
    zrevrange_with_scores, zrevrank,
)
from app.routes._common import assert_own_data
from app.schemas.leaderboard import (
    ClassLeaderboardResponse,
    StudentRankResponse,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── Leaderboard ───────────────────────────────────────────────────────────────

@router.get("/leaderboard/{class_num}", response_model=ClassLeaderboardResponse)
async def class_leaderboard(
    class_num: int = Path(ge=1, le=12),
    top: int = Query(default=10, ge=1, le=100),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> ClassLeaderboardResponse:
    """
    Top students for a class from Redis sorted set.
    Scores accumulated from quiz batch-submits in quiz_service.

    Requires a logged-in caller. The response body is a list of raw student
    UUIDs paired with performance scores, for any of classes 1-12, up to 100
    at a time — with no auth dependency at all that was an anonymous
    student-id enumeration endpoint. A leaderboard is a social feature, so
    this is deliberately only authentication (any signed-in user may view the
    rankings), NOT the self-only assert_own_data guard its per-student
    sibling below uses.
    """
    raw = await zrevrange_with_scores(leaderboard_key(class_num), 0, top - 1)
    entries = [
        {"rank": i + 1, "student_id": uid, "score": round(score, 2)}
        for i, (uid, score) in enumerate(raw)
    ]
    return ClassLeaderboardResponse(class_num=class_num, entries=entries)


@router.get("/leaderboard/{class_num}/rank/{student_id}", response_model=StudentRankResponse)
async def student_rank(
    class_num: int = Path(ge=1, le=12),
    student_id: uuid.UUID = Path(...),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> StudentRankResponse:
    """Return a specific student's rank and score in their class leaderboard.

    Security fix: this route previously only required *a* valid JWT, not any
    relationship to student_id — any authenticated student could look up any
    other student's rank/score. Every other per-student route in this service
    uses assert_own_data (self-or-403); this route is unused by both the web
    and mobile clients today (they use gamification's own leaderboard), so
    there's no known legitimate cross-student use case to preserve — apply
    the same self-only guard as its siblings.
    """
    assert_own_data(current_user_id, student_id)
    member = str(student_id)
    rank = await zrevrank(leaderboard_key(class_num), member)
    raw  = await zrevrange_with_scores(leaderboard_key(class_num), 0, -1)
    score = next((s for uid, s in raw if uid == member), 0.0)
    return StudentRankResponse(
        student_id=member,
        class_num=class_num,
        rank=(rank + 1) if rank is not None else None,
        score=round(score, 2),
        total_students=len(raw),
    )
