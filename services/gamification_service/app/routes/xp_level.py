import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin, verify_owner_or_admin
from app.database.session import get_db
from app.models.gamification import XPEvent
from app.schemas.gamification import AwardXPRequest, LevelInfoResponse
from app.services.gamification_service import GamificationService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── XP / Level endpoints ──────────────────────────────────────────────────────

@router.post("/xp/award", dependencies=[Depends(require_admin)])
async def award_xp(
    body: AwardXPRequest,
    db: AsyncSession = Depends(get_db),
):
    """Award XP for an event — committed before the response is sent.

    ADMIN ONLY. A user's own JWT used to be accepted here (caller == target),
    but the (user_id, event, reference_id) dedup only blocks an exact replay,
    so a student could loop this with a fresh random reference_id each time and
    mint unlimited XP, choosing any event (battle wins, etc). Real awards come
    from the service-to-service internal routes (/internal/xp/apply,
    /internal/quiz-xp/award, /internal/event-xp/award, ...), all require_internal.
    This public route now only backs the admin panel's manual XP grant.


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
    goal_id, etc).
    """
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
