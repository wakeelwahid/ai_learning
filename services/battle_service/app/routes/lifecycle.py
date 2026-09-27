import asyncio
import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import settings
from app.core.dependencies import get_current_user_id, require_admin
from app.core.websocket_manager import manager, player_joined_msg
from app.database.session import get_db
from app.models.battle import Battle, BattleType
from app.routes._common import strip_answers
from app.schemas.lifecycle import ChallengeFriendRequest, CreateBattleRequest, JoinBattleRequest
from app.services._common import battle_to_dict
from app.services.battle_lifecycle_service import BattleLifecycleService
from app.services.battle_query_service import BattleQueryService
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/battles", tags=["battles"])


# Every battle type battle-creation itself treats as invite-only (see
# `private_types` in battle_lifecycle_service.py's create_battle — each of
# these gets a real invite_code generated specifically because it's NOT
# meant to be publicly joinable by bare ID).
_PRIVATE_BATTLE_TYPES = (
    BattleType.ONE_V_ONE, BattleType.GROUP, BattleType.CLASS_BATTLE,
    BattleType.SCHOOL_BATTLE, BattleType.TEAM, BattleType.STUDY_PARTY,
)


async def _check_battle_play_quota(user_id: uuid.UUID) -> None:
    """Admin-configurable daily quota for creating OR joining a battle (see
    gamification_service's FeatureUsageService — one "battle_play" bucket
    covers both, since either action is "playing a battle" for quota
    purposes). Fails open (never blocks) if gamification_service is
    unreachable, same trade-off used by every other gated service."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/usage/check-and-log",
                json={"user_id": str(user_id), "feature_key": "battle_play"},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        return
    if resp.status_code == 429:
        # Forward gamification_service's ready-to-show message verbatim —
        # never invent wording here.
        detail = resp.json().get("detail", {})
        message = detail.get("message") if isinstance(detail, dict) else None
        raise HTTPException(status_code=429, detail=message)


async def _guard_private_battle_join(battle: Battle, joiner_id: uuid.UUID) -> None:
    """/join (real invite-code redemption, presented by the client) doesn't
    call this — possessing the actual code is the authorization there. But
    /join-and-join-by-id below derive the invite_code server-side from a
    bare battle_id and never make the caller present it, so without this
    guard anyone who can see (or guess) a battle_id could join any private
    battle ahead of its intended participants.

    ONE_V_ONE specifically allows the host's real friends through — mirrors
    the exact check challenge_friend() already enforces at creation time.
    The other five private types (group/class/school/team/study_party) have
    no equivalent "who's allowed" concept implemented yet, so they simply
    can't be joined by bare ID at all; the real invite-code route still
    works for all of them. Raises 404 on failure (not 403 — a stranger
    probing a battle_id shouldn't learn whether it exists, only that they
    can't join it this way)."""
    if battle.battle_type not in _PRIVATE_BATTLE_TYPES or joiner_id == battle.host_user_id:
        return
    if battle.battle_type != BattleType.ONE_V_ONE:
        raise HTTPException(status_code=404, detail="Battle not found")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/friends",
                params={"user_id": str(battle.host_user_id)},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        raise HTTPException(status_code=503, detail="Friend list temporarily unavailable. Try again.")
    if resp.status_code != 200 or not any(f["user_id"] == str(joiner_id) for f in resp.json()):
        raise HTTPException(status_code=404, detail="Battle not found")


# ── REST: Seed / Create / Join ─────────────────────────────────────────────────

@router.post("/seed", dependencies=[Depends(require_admin)])
async def seed_test_data(
    user_id: uuid.UUID = Query(...),
    display_name: str = Query(default="Test User", max_length=100),
    db: AsyncSession = Depends(get_db),
):
    """Create sample battles of every type for testing/demo purposes."""
    svc = BattleLifecycleService(db)
    try:
        return await svc.seed_test_data(user_id, display_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("", status_code=201)
async def create_battle(
    body: CreateBattleRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    display_name: str = Query(..., max_length=100),
    avatar_url: str | None = Query(default=None, max_length=500),
    db: AsyncSession = Depends(get_db),
):
    """Create a new battle room. Returns battle details + invite_code (for 1v1 / group)."""
    await _check_battle_play_quota(caller_id)
    svc = BattleLifecycleService(db)
    queries = BattleQueryService(db)
    try:
        battle = await svc.create_battle(
            host_user_id=caller_id,
            battle_type=body.battle_type,
            subject=body.subject,
            topic=body.topic,
            board=body.board,
            class_num=body.class_num,
            difficulty=body.difficulty,
            question_count=body.question_count,
            time_limit_sec=body.time_limit_sec,
            max_players=body.max_players,
            display_name=display_name,
            avatar_url=avatar_url,
            team_a_name=body.team_a_name,
            team_b_name=body.team_b_name,
            class_a=body.class_a,
            class_b=body.class_b,
            school_a=body.school_a,
            school_b=body.school_b,
            scheduled_at=body.scheduled_at,
        )
        # Use get_battle for full participant list; fall back to battle object if it fails
        try:
            result = await queries.get_battle(battle.id)
            questions = strip_answers(result.pop("questions", None) or battle.questions or [])
        except Exception:
            result = battle_to_dict(battle, [])
            questions = strip_answers(battle.questions or [])
        return {**result, "questions": questions}
    except Exception as e:
        logger.error("create_battle failed: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


async def notify_challenged_friend(friend_id: str, challenger_name: str, subject: str | None, invite_code: str | None, stake_xp: int = 50) -> None:
    """Fire-and-forget: notification_service persists an in-app row for the
    challenged friend AND enqueues real push delivery over Celery/RabbitMQ."""
    label = f"a {subject} battle" if subject else "a quiz battle"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                settings.NOTIFICATION_SERVICE_URL + "/api/v1/notifications/internal/notify",
                json={
                    "user_id": friend_id,
                    "title": "⚔️ Battle Challenge!",
                    "body": f"{challenger_name} challenged you to {label} — win +{stake_xp} XP & +50 EduPoints, lose −{stake_xp} XP! Code: {invite_code}",
                    "template": "battle_challenge",
                },
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:  # noqa: BLE001
        pass


@router.post("/challenge", status_code=201)
async def challenge_friend(
    body: ChallengeFriendRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """One-shot 'Challenge Friend' from the Growth Dashboard: creates a private
    1v1 battle and notifies the friend (in-app + queued push) with the invite
    code. Server-enforced: you can only challenge users who are your ACCEPTED
    friends — verified against user_service's friend graph, which also gives us
    the challenger's display name as the friend sees it."""
    if body.friend_id == caller_id:
        raise HTTPException(status_code=400, detail="You can't challenge yourself.")
    await _check_battle_play_quota(caller_id)

    # One lookup does double duty: proves the friendship AND yields the
    # caller's name/avatar exactly as the friend knows them.
    challenger_name, challenger_avatar = None, None
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/friends",
                params={"user_id": str(body.friend_id)},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
    except Exception:
        raise HTTPException(status_code=503, detail="Friend list temporarily unavailable. Try again.")
    if resp.status_code != 200:
        raise HTTPException(status_code=503, detail="Friend list temporarily unavailable. Try again.")
    for f in resp.json():
        if f["user_id"] == str(caller_id):
            challenger_name = f.get("full_name") or "A friend"
            challenger_avatar = f.get("avatar_url")
            break
    if challenger_name is None:
        raise HTTPException(status_code=403, detail="You can only challenge your friends.")

    # Question count is derived from the chosen timer server-side — clients
    # can't request a mismatched combination: 10 min → 7 Q, 20 min → 15 Q,
    # 30 min → 20 Q (shorter timers fall back to the 5-question quick battle).
    if body.time_limit_sec >= 1500:
        question_count = 20
    elif body.time_limit_sec >= 900:
        question_count = 15
    elif body.time_limit_sec >= 600:
        question_count = 7
    else:
        question_count = 5

    # Stake eligibility: BOTH players must hold the full stake (min 50 XP,
    # chosen by the challenger) so the loser can actually pay it. The two
    # lookups run concurrently on one pooled client — this endpoint sits on
    # the hot path for chat screens, so no serial round-trips.
    stake = body.stake_xp
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            xp_headers = {"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET}
            mine_r, theirs_r = await asyncio.gather(
                client.get(f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/xp/{caller_id}", headers=xp_headers),
                client.get(f"{settings.GAMIFICATION_SERVICE_URL}/api/v1/gamification/internal/xp/{body.friend_id}", headers=xp_headers),
            )
            mine, theirs = mine_r.json(), theirs_r.json()
    except Exception:
        raise HTTPException(status_code=503, detail="XP check temporarily unavailable. Try again.")
    my_xp, their_xp = mine.get("total_xp", 0), theirs.get("total_xp", 0)
    if my_xp < stake:
        raise HTTPException(
            status_code=400,
            detail=f"You need at least {stake} XP for this stake "
                   f"(you have {my_xp}). Lower the stake or earn more XP first.",
        )
    if their_xp < stake:
        raise HTTPException(
            status_code=400,
            detail=f"Your friend doesn't have enough XP for this stake — they need at least {stake} XP.",
        )

    svc = BattleLifecycleService(db)
    try:
        battle = await svc.create_battle(
            host_user_id=caller_id,
            battle_type="1v1",
            subject=body.subject,
            topic=body.topic,
            board=None,
            class_num=body.class_num,
            difficulty=body.difficulty,
            question_count=question_count,
            time_limit_sec=body.time_limit_sec,
            max_players=2,
            display_name=challenger_name,
            avatar_url=challenger_avatar,
            stake_xp=stake,
        )
    except Exception as e:
        logger.error("challenge_friend create failed: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

    asyncio.create_task(notify_challenged_friend(
        str(body.friend_id), challenger_name, body.subject, battle.invite_code, stake,
    ))

    return {
        "battle_id": str(battle.id),
        "invite_code": battle.invite_code,
        "status": battle.status.value if hasattr(battle.status, "value") else str(battle.status),
        "question_count": battle.question_count,
        "time_limit_sec": battle.time_limit_sec,
        "subject": battle.subject,
        "friend_id": str(body.friend_id),
        "reward": {
            "win_xp": stake,
            "win_edupoints": 50,
            "loss_xp": -stake,
            "min_xp_required": stake,
            "stake_xp": stake,
        },
    }


@router.post("/join")
async def join_battle(
    body: JoinBattleRequest,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    display_name: str = Query(..., max_length=100),
    avatar_url: str | None = Query(default=None, max_length=500),
    db: AsyncSession = Depends(get_db),
):
    """Join a battle via invite code."""
    await _check_battle_play_quota(caller_id)
    svc = BattleLifecycleService(db)
    queries = BattleQueryService(db)
    try:
        battle = await svc.join_battle(
            invite_code=body.invite_code,
            user_id=caller_id,
            display_name=display_name,
            avatar_url=avatar_url,
        )
        result = await queries.get_battle(battle.id)
        questions = strip_answers(battle.questions or [])

        # Notify existing players via WebSocket
        new_participant = next(
            (p for p in result["participants"] if str(p.get("user_id")) == str(caller_id)),
            None,
        )
        if new_participant:
            await manager.broadcast(
                str(battle.id),
                player_joined_msg(new_participant),
                exclude_user=str(caller_id),
            )

        return {**result, "questions": questions}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{battle_id}/join")
async def join_battle_direct(
    battle_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    display_name: str = Query(..., max_length=100),
    avatar_url: str | None = Query(default=None, max_length=500),
    db: AsyncSession = Depends(get_db),
):
    """Join a battle directly by battle_id (alias for join-by-id)."""
    svc = BattleLifecycleService(db)
    queries = BattleQueryService(db)
    battle = await queries.get_battle_by_id_or_none(battle_id)
    if not battle or not battle.invite_code:
        raise HTTPException(status_code=404, detail="Battle not found")
    await _guard_private_battle_join(battle, caller_id)
    await _check_battle_play_quota(caller_id)

    try:
        updated = await svc.join_battle(
            invite_code=battle.invite_code,
            user_id=caller_id,
            display_name=display_name,
            avatar_url=avatar_url,
        )
        result = await queries.get_battle(updated.id)
        questions = strip_answers(battle.questions or [])
        return {**result, "questions": questions}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{battle_id}/join-by-id")
async def join_battle_by_id(
    battle_id: uuid.UUID,
    caller_id: uuid.UUID = Depends(get_current_user_id),
    display_name: str = Query(..., max_length=100),
    avatar_url: str | None = Query(default=None, max_length=500),
    db: AsyncSession = Depends(get_db),
):
    """Join a battle from the open lobby using battle ID."""
    svc = BattleLifecycleService(db)
    queries = BattleQueryService(db)
    battle = await queries.get_battle_by_id_or_none(battle_id)
    if not battle or not battle.invite_code:
        raise HTTPException(status_code=404, detail="Battle not found")
    await _guard_private_battle_join(battle, caller_id)
    await _check_battle_play_quota(caller_id)

    try:
        updated = await svc.join_battle(
            invite_code=battle.invite_code,
            user_id=caller_id,
            display_name=display_name,
            avatar_url=avatar_url,
        )
    except ValueError as e:
        msg = str(e)
        if "already" in msg.lower():
            # User is rejoining (host/prior participant) — return current state
            updated = battle
        else:
            raise HTTPException(status_code=400, detail=msg)
    result = await queries.get_battle(updated.id)
    questions = strip_answers(battle.questions or [])
    return {**result, "questions": questions}
