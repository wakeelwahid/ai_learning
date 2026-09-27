import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, is_admin_role, verify_owner_or_admin
from app.database.session import get_db
from app.models.gamification import XPEvent
from app.routes._common import peek_role
from app.schemas.gamification import AwardXPRequest, LevelInfoResponse
from app.services.gamification_service import GamificationService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── XP / Level endpoints ──────────────────────────────────────────────────────

@router.post("/xp/award")
async def award_xp(
    body: AwardXPRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(peek_role),
):
    """Award XP for an event — committed before the response is sent.

    Was previously dispatched via FastAPI BackgroundTasks, which runs
    AFTER the response and has no persistence: a process crash/restart
    between the response and task execution silently dropped the award
    with no trace. Made synchronous instead, matching the already-proven
    pattern used by /internal/xp/apply and /internal/challenge-result —
    the write itself is a single cheap upsert + indexed insert, so this
    only changes response latency, not behavior.

    Phase 11: Only admins or the authenticated user themselves may award XP.
    Prevents IDOR where a user could forge body.user_id to inflate another
    user's XP arbitrarily.

    Phase 12: every event except DAILY_LOGIN requires a reference_id tying
    the award to a specific real occurrence (a battle_id, quiz_attempt_id,
    goal_id, etc). Combined with the (user_id, event, reference_id) dedup in
    GamificationService, this closes the self-serve abuse where a caller
    could replay this endpoint with the same event value for unlimited XP —
    a repeat reference_id is now a no-op instead of a fresh award.
    DAILY_LOGIN is naturally idempotent, so callers pass reference_id=None
    and get their once-per-day amount from the streak/season logic instead.
    """
    if current_user_id != body.user_id and not is_admin_role(_role):
        raise HTTPException(status_code=403, detail="Cannot award XP to another user.")
    if body.event != XPEvent.DAILY_LOGIN and not body.reference_id:
        raise HTTPException(
            status_code=422,
            detail=f"reference_id is required for event '{body.event.value}'.",
        )
    result = await GamificationService(db).award_xp(body.user_id, body.event, body.reference_id)
    await db.commit()
    return result


@router.get("/level/{user_id}", response_model=LevelInfoResponse, dependencies=[Depends(verify_owner_or_admin)])
async def get_level_info(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Detailed level info: current level, XP needed, unlocked features, progress %."""
    info = await GamificationService(db).get_level_info(user_id)
    return LevelInfoResponse(**info)
