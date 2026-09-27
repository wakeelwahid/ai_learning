import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_claims, get_current_user_id, require_internal
from app.core.websocket_manager import manager
from app.crud import query_crud
from app.database.session import get_db
from app.routes._common import require_self_or_admin
from app.schemas.queries import StudentSummaryOut
from app.services.battle_query_service import BattleQueryService

router = APIRouter(prefix="/battles", tags=["battles"])


@router.get("/open")
async def list_open_battles(
    subject: str | None = Query(default=None),
    battle_type: str | None = Query(default=None),
    class_num: int | None = Query(default=None),
    limit: int = Query(default=50, le=50),
    _caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List battles open for joining (waiting/starting) or spectating (active)."""
    svc = BattleQueryService(db)
    result = await svc.list_open_battles(subject, battle_type, class_num, limit)
    # online_players comes from the in-process WS connection manager (Redis/
    # in-memory live state), not the DB, so it's filled in here rather than
    # inside the service — same value the original inline code computed.
    for row in result["battles"]:
        row["online_players"] = manager.player_count(row["id"])
    return result


@router.get("/my")
async def get_my_battles(
    caller_id: uuid.UUID = Depends(get_current_user_id),
    limit: int = Query(default=10, le=50),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """Return battles created by this user, newest first, paginated."""
    svc = BattleQueryService(db)
    return await svc.get_my_battles(caller_id, limit, offset)


@router.get("/stats/{user_id}")
async def get_stats(
    user_id: uuid.UUID,
    claims: dict = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_db),
):
    """Return battle stats for `user_id` — callers may only view their own stats unless admin."""
    require_self_or_admin(user_id, claims)
    svc = BattleQueryService(db)
    return await svc.get_user_stats(user_id)


@router.get("/history/{user_id}")
async def get_history(
    user_id: uuid.UUID,
    limit: int = Query(default=20, le=50),
    claims: dict = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_db),
):
    """Return battle history for `user_id` — callers may only view their own history unless admin."""
    require_self_or_admin(user_id, claims)
    svc = BattleQueryService(db)
    return {"history": await svc.get_history(user_id, limit)}


@router.get("/leaderboard/global")
async def get_leaderboard(
    limit: int = Query(default=20, le=50),
    db: AsyncSession = Depends(get_db),
):
    svc = BattleQueryService(db)
    return {"leaderboard": await svc.get_leaderboard(limit)}


@router.get("/starting-soon", dependencies=[Depends(require_internal)])
async def get_battles_starting_soon(
    lead_minutes: int = Query(default=10, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Battle Reminder feed — battles scheduled to start within
    `lead_minutes` that haven't been reminded yet, with their joined
    participants' user_ids. Atomically marks each returned battle as
    reminded (reminder_sent_at) in the same call, so a repeat poll (this
    runs every ~1 minute from notification_service) never double-notifies.
    Called service-to-service — network-gated, no end-user JWT involved."""
    svc = BattleQueryService(db)
    return await svc.get_battles_starting_soon(lead_minutes)


@router.get(
    "/internal/student/{user_id}/summary",
    response_model=StudentSummaryOut,
    include_in_schema=False,
    dependencies=[Depends(require_internal)],
)
async def get_student_summary(
    user_id: uuid.UUID,
    days: int = Query(default=90, ge=1, le=365),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Parent-RAG feed — this student's lifetime battle stats plus
    their finished battles in the last `days`, aggregated by subject. Called
    service-to-service, network-gated, no end-user JWT involved. Always 200:
    a student with no battles gets zeros and empty lists, never a 404."""
    svc = BattleQueryService(db)
    return await svc.get_student_summary(user_id, days, limit)


@router.get(
    "/internal/completed/{user_id}/{battle_id}",
    include_in_schema=False,
    dependencies=[Depends(require_internal)],
)
async def internal_has_completed_specific_battle(
    user_id: uuid.UUID, battle_id: uuid.UUID, db: AsyncSession = Depends(get_db),
):
    """[Internal] Has this user finished THIS specific battle?
    gamification_service's Challenge Programs feature calls this to verify
    a battle-type challenge task server-side."""
    return {"completed": await query_crud.has_completed_specific_battle(db, user_id, battle_id)}


@router.get("/{battle_id}")
async def get_battle(
    battle_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    svc = BattleQueryService(db)
    try:
        battle = await svc.get_battle(battle_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    # invite_code is how a private 1v1 is joined — it must not leak to
    # spectators/strangers who found the battle_id some other way (e.g. from
    # the public /open listing of an in-progress battle). Only an existing
    # participant (who already has it, or doesn't need it) gets it back.
    is_participant = any(
        p.get("user_id") == str(caller_id) for p in battle.get("participants", [])
    )
    if not is_participant:
        battle["invite_code"] = None
    return battle
