import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import ADMIN_ROLES, get_current_user_claims, get_current_user_id
from app.core.redis_state import RedisBattleState
from app.core.websocket_manager import (
    answer_result_msg,
    battle_finished_msg,
    battle_started_msg,
    battle_starting_msg,
    leaderboard_msg,
    manager,
)
from app.database.session import get_db
from app.models.battle import BattleStatus
from app.routes._common import client_question, require_self_or_admin, strip_answers
from app.schemas.gameplay import SubmitAnswerRequest
from app.services.battle_gameplay_service import BattleGameplayService
from app.services.battle_lifecycle_service import BattleLifecycleService
from app.services.battle_query_service import BattleQueryService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/battles", tags=["battles"])


@router.post("/{battle_id}/start")
async def start_battle(
    battle_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Host/participant starts the battle — broadcasts countdown and first question via WebSocket."""
    svc = BattleLifecycleService(db)
    queries = BattleQueryService(db)
    if not await queries.get_participant_for_user(battle_id, caller_id):
        raise HTTPException(status_code=403, detail="Only battle participants can start this battle")

    try:
        battle = await svc.start_battle(battle_id)
        questions = battle.questions or []

        # Broadcast starting + first question
        await manager.broadcast(str(battle_id), battle_starting_msg(3))
        if questions:
            q = client_question(questions[0], 0)
            await manager.broadcast(
                str(battle_id),
                battle_started_msg(q, 0, len(questions), battle.time_limit_sec),
            )
        return {"status": "started", "battle_id": str(battle_id)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{battle_id}/regenerate-questions")
async def regenerate_questions(
    battle_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Host rolls a fresh random question set (same subject/topic/difficulty)
    while the battle is still in the lobby — e.g. after the challenged friend
    has joined. The new (answer-stripped) set is broadcast over the battle
    WebSocket so every joined client replaces its local list."""
    svc = BattleGameplayService(db)
    queries = BattleQueryService(db)
    battle = await queries.get_battle_by_id_or_none(battle_id)
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")
    if battle.host_user_id != caller_id:
        raise HTTPException(status_code=403, detail="Only the host can regenerate questions")
    if battle.status != BattleStatus.WAITING:
        raise HTTPException(status_code=400, detail="Questions can only be regenerated before the battle starts")

    try:
        questions = await svc.regenerate_questions(battle)
    except Exception as e:
        logger.error("regenerate_questions failed: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail="Could not generate new questions. Try again.")

    stripped = strip_answers(questions)
    await manager.broadcast(
        str(battle_id),
        {"type": "questions_regenerated", "payload": {"questions": stripped, "count": len(stripped)}},
    )
    return {"battle_id": str(battle_id), "questions": stripped, "count": len(stripped)}


@router.post("/{battle_id}/answer")
async def submit_answer(
    battle_id: uuid.UUID,
    body: SubmitAnswerRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Submit an answer and broadcast updated leaderboard."""
    svc = BattleGameplayService(db)
    queries = BattleQueryService(db)
    try:
        result = await svc.submit_answer(
            battle_id=battle_id,
            user_id=caller_id,
            question_idx=body.question_idx,
            answer=body.answer,
            time_taken_ms=body.time_taken_ms,
        )
        # Send personal result to user (include correct_answer for UI highlighting)
        await manager.send_personal(
            str(battle_id), str(caller_id),
            {**answer_result_msg(result["correct"], result["score"], result["accuracy"]),
             "correct_answer": result.get("correct_answer", "")},
        )
        # Broadcast leaderboard — Redis first (< 1ms), DB fallback
        try:
            participants = await RedisBattleState.get_leaderboard(str(battle_id))
            if not participants:
                raise ValueError("empty")
        except Exception:
            battle_data = await queries.get_battle(battle_id)
            participants = battle_data["participants"]
        await manager.broadcast(str(battle_id), leaderboard_msg(participants))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{battle_id}/finish")
async def finish_battle(
    battle_id: uuid.UUID,
    claims: dict = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_db),
):
    """Force-finish battle and compute final rankings + XP.

    Restricted to the battle's participants, its creator, or an admin —
    previously any authenticated user could force-finish (and trigger XP
    payouts for) a battle they had no part in.
    """
    caller_id = uuid.UUID(claims["sub"])
    svc = BattleGameplayService(db)
    queries = BattleQueryService(db)
    if claims.get("role") not in ADMIN_ROLES:
        battle_row = await queries.get_battle_by_id_or_none(battle_id)
        if not battle_row:
            raise HTTPException(status_code=404, detail="Battle not found")
        if battle_row.host_user_id != caller_id:
            if not await queries.get_participant_for_user(battle_id, caller_id):
                raise HTTPException(status_code=403, detail="Only battle participants can finish this battle")

    try:
        result = await svc.finish_battle(battle_id)
        await manager.broadcast(str(battle_id), battle_finished_msg(result))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{battle_id}/spectate")
async def join_as_spectator(
    battle_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    display_name: str = Query(..., max_length=100),
    db: AsyncSession = Depends(get_db),
):
    """Join a battle as a spectator — read-only observer, not counted as a player.

    Spectators receive leaderboard and question events via WebSocket but cannot
    submit answers. They are tracked in the battle_participants table with
    is_spectator=True and incremented in battle.spectator_count.
    """
    svc = BattleGameplayService(db)
    queries = BattleQueryService(db)
    battle = await queries.get_battle_by_id_or_none(battle_id)
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")
    if battle.status not in [BattleStatus.WAITING, BattleStatus.STARTING, BattleStatus.ACTIVE]:
        raise HTTPException(status_code=400, detail="Battle is not joinable as spectator")

    # Check if already a spectator
    if await queries.get_spectator_for_user(battle_id, caller_id):
        # Already a spectator — return current battle state
        return await queries.get_battle(battle_id)

    await svc.add_spectator(battle, caller_id, display_name)

    result = await queries.get_battle(battle_id)
    # Notify players a spectator joined
    await manager.broadcast(
        str(battle_id),
        {"type": "spectator_joined", "payload": {"display_name": display_name, "spectator_count": battle.spectator_count}},
    )
    return {**result, "is_spectator": True}


@router.post("/{battle_id}/rematch")
async def create_rematch(
    battle_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    display_name: str = Query(..., max_length=100),
    db: AsyncSession = Depends(get_db),
):
    """Create a new battle using the same settings as an existing battle.

    The requesting user becomes the host of the new battle room. The new
    battle has the same type, subject, difficulty, question_count and
    time_limit_sec as the original.
    """
    # 1. Fetch original battle
    svc = BattleLifecycleService(db)
    queries = BattleQueryService(db)
    original = await queries.get_battle_by_id_or_none(battle_id)
    if not original:
        raise HTTPException(status_code=404, detail="Battle not found")

    # 2. Create new battle with same core settings
    try:
        new_battle = await svc.create_battle(
            host_user_id=caller_id,
            battle_type=original.battle_type.value,
            subject=original.subject,
            topic=original.topic,
            board=original.board,
            class_num=original.class_num,
            difficulty=original.difficulty,
            question_count=original.question_count,
            time_limit_sec=original.time_limit_sec,
            max_players=original.max_players,
            display_name=display_name,
            avatar_url=None,
            team_a_name=original.team_a_name,
            team_b_name=original.team_b_name,
            class_a=original.class_a,
            class_b=original.class_b,
            school_a=original.school_a,
            school_b=original.school_b,
        )

        # 3. Return new battle object (same shape as create_battle response)
        result = await queries.get_battle(new_battle.id)
        questions = strip_answers(new_battle.questions or [])
        return {**result, "questions": questions, "rematch_of": str(battle_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{battle_id}/review")
async def get_battle_review(
    battle_id: uuid.UUID,
    user_id: uuid.UUID = Query(...),
    claims: dict = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_db),
):
    """Alias for /replay — return a full question-by-question review of a completed battle."""
    require_self_or_admin(user_id, claims)
    return await get_battle_replay(battle_id=battle_id, user_id=user_id, claims=claims, db=db)


@router.get("/{battle_id}/replay")
async def get_battle_replay(
    battle_id: uuid.UUID,
    user_id: uuid.UUID = Query(...),
    claims: dict = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_db),
):
    """Return a full question-by-question replay of a completed battle for a user.

    Response shape:
      {
        battle_id, subject, type, completed_at,
        questions: [
          { question_text, options, correct_answer, your_answer,
            is_correct, points_earned, explanation }
        ],
        score, accuracy, rank, xp_earned
      }

    `user_id` must match the JWT-verified caller (or the caller must be an
    admin) — this endpoint previously only checked that SOME participant row
    existed for the battle, never that the caller was actually that
    participant, letting anyone with a valid token read any other user's
    battle replay by passing their `user_id`.
    """
    require_self_or_admin(user_id, claims)

    svc = BattleGameplayService(db)
    queries = BattleQueryService(db)

    # 1. Fetch battle — must be completed
    battle = await queries.get_battle_by_id_or_none(battle_id)
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")
    if battle.status != BattleStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail=f"Battle is not completed (current status: {battle.status.value})",
        )

    # 2. Fetch participant record for this user
    participant = await queries.get_participant_for_user(battle_id, user_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant record not found for this user")

    # 3. Build and return question-by-question replay payload
    return await svc.build_battle_replay(battle, participant)
