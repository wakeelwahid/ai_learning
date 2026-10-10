import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_internal
from app.crud.gamification_crud import (
    count_completed_challenges,
    get_recent_daily_goals,
    get_recent_xp_transactions,
    get_user_badges,
    get_user_edupoints,
    get_user_streak,
    get_user_xp,
    get_xp_transaction_by_reference,
)
from app.database.session import get_db
from app.models.gamification import CHALLENGE_MIN_XP, EduPointEvent, XPEvent
from app.schemas.gamification import (
    AwardEduPointsRequest,
    AwardXPRequest,
    ChallengeResultRequest,
    InternalQuizXPRequest,
    InternalReferralRewardRequest,
    InternalStudentProfileResponse,
    InternalXPApplyRequest,
)
from app.services.gamification_service import EduPointsService, GamificationService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Internal XP endpoints (service-to-service, no end-user JWT) ───────────────

@router.get("/internal/xp/{user_id}", dependencies=[Depends(require_internal)])
async def internal_get_xp(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """[Internal] Current XP/level for a user — used by battle_service to check
    the CHALLENGE_MIN_XP eligibility of both players before a stake battle."""
    info = await GamificationService(db).get_level_info(user_id)
    return {
        "user_id": str(user_id),
        "total_xp": info["total_xp"],
        "level": info["level"],
        "challenge_min_xp": CHALLENGE_MIN_XP,
        "challenge_eligible": info["total_xp"] >= CHALLENGE_MIN_XP,
    }


@router.post("/internal/xp/apply", dependencies=[Depends(require_internal)])
async def internal_apply_xp(
    body: InternalXPApplyRequest,
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Apply a computed XP amount (battle rank rewards) for a user.
    Goes through the same season-reset / level / badge path as award_xp."""
    result = await GamificationService(db)._apply_xp_amount(
        body.user_id, body.amount, XPEvent.BATTLE_PLAYED, body.reference_id,
    )
    await db.commit()
    return result


@router.post("/internal/quiz-xp/award", dependencies=[Depends(require_internal)])
async def internal_award_quiz_xp(
    body: InternalQuizXPRequest,
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Award the XP_REWARDS quiz-completion event for a finished
    quiz attempt — called by quiz_service right after a real submit_quiz()/
    batch_submit() completion. Exactly one tier is granted, the highest the
    score qualifies for (QUIZ_PERFECT on 100%, else QUIZ_SCORE_80 on >=80%,
    else QUIZ_COMPLETED for any completion), not all three cumulatively.
    Idempotent per reference_id via award_xp's own (user_id, event,
    reference_id) dedup, so a retried call for the same attempt is a
    safe no-op."""
    if body.percentage >= 100.0:
        event = XPEvent.QUIZ_PERFECT
    elif body.percentage >= 80.0:
        event = XPEvent.QUIZ_SCORE_80
    else:
        event = XPEvent.QUIZ_COMPLETED
    result = await GamificationService(db).award_xp(body.user_id, event, body.reference_id)
    await db.commit()
    return {"user_id": str(body.user_id), "event": event.value, **result}


@router.post("/internal/event-xp/award", dependencies=[Depends(require_internal)])
async def internal_award_event_xp(
    body: AwardXPRequest,
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Award a fixed XP_REWARDS event for a user from a trusted
    backend caller that has already verified the event really happened
    (e.g. career_service on career_goal_set / skill_gap_done). This is the
    service-to-service replacement for the old public POST /xp/award, which
    is now admin-only: an end-user's own JWT must never be able to pick the
    event and mint XP for themselves. Idempotent per (user_id, event,
    reference_id) via award_xp's own dedup."""
    result = await GamificationService(db).award_xp(body.user_id, body.event, body.reference_id)
    await db.commit()
    return result


@router.post("/internal/event-edupoints/award", dependencies=[Depends(require_internal)])
async def internal_award_event_edupoints(
    body: AwardEduPointsRequest,
    db: AsyncSession = Depends(get_db),
):
    """[Internal] EduPoints counterpart of /internal/event-xp/award — a
    trusted backend caller awards a fixed EduPointEvent it has verified.
    Service-to-service replacement for the now admin-only public
    POST /edupoints/award. Idempotent per (user_id, event, reference_id)."""
    result = await EduPointsService(db).award(body.user_id, body.event, body.reference_id)
    await db.commit()
    return result


@router.post("/internal/referral-reward", dependencies=[Depends(require_internal)])
async def internal_referral_reward(
    body: InternalReferralRewardRequest,
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Grant the fixed REFERRAL_SUCCESS XP+EduPoints award —
    called by referral_service for BOTH sides of a completed referral: the
    referrer (once a milestone count is reached) and the referred friend
    (once, on their own first qualifying milestone). Idempotent per
    reference_id via award_xp/EduPointsService.award's own
    (user_id, event, reference_id) dedup — a retried call with the same
    reference_id is a safe no-op, never a double credit."""
    gsvc = GamificationService(db)
    xp_result = await gsvc.award_xp(body.user_id, XPEvent.REFERRAL_SUCCESS, body.reference_id)
    ep_result = await EduPointsService(db).award(body.user_id, EduPointEvent.REFERRAL_SUCCESS, body.reference_id)
    await db.commit()
    return {
        "user_id": str(body.user_id),
        "xp_awarded": xp_result.get("xp_awarded", 0),
        "edupoints_awarded": ep_result.get("points_awarded", 0),
    }


@router.post("/internal/challenge-result", dependencies=[Depends(require_internal)])
async def internal_challenge_result(
    body: ChallengeResultRequest,
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Settle a friend-challenge stake battle: winner gains the
    stake as XP plus CHALLENGE_WIN EduPoints (+50); loser pays the stake
    (floored at 0). Idempotent per battle: a CHALLENGE_WIN transaction with
    this reference_id already on record means the battle was settled — repeat
    calls (double /finish, retries) are no-ops."""
    if body.reference_id:
        dup = await get_xp_transaction_by_reference(
            db, body.winner_user_id, XPEvent.CHALLENGE_WIN, body.reference_id
        )
        if dup:
            return {"already_settled": True, "reference_id": body.reference_id}

    gsvc = GamificationService(db)
    win = await gsvc._apply_xp_amount(body.winner_user_id, body.stake_xp, XPEvent.CHALLENGE_WIN, body.reference_id)
    loss = await gsvc._apply_xp_amount(body.loser_user_id, -body.stake_xp, XPEvent.CHALLENGE_LOSS, body.reference_id)
    ep = await EduPointsService(db).award(body.winner_user_id, EduPointEvent.CHALLENGE_WIN, body.reference_id)
    await db.commit()
    return {
        "winner": {"user_id": str(body.winner_user_id), **win, "edupoints_awarded": ep["points_awarded"]},
        "loser": {"user_id": str(body.loser_user_id), **loss},
        "stake_xp": body.stake_xp,
    }


@router.get(
    "/internal/student/{user_id}/profile",
    response_model=InternalStudentProfileResponse,
    include_in_schema=False,
    dependencies=[Depends(require_internal)],
)
async def internal_student_profile(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """[Internal] Full gamification snapshot for the parent-RAG indexer.
    Strictly read-only: unlike GET /gamification/profile/{user_id} and
    /goals/internal/today/{user_id}, it goes straight to the crud reads so
    indexing a student never creates an XP/EduPoints/goal row for them.
    Returns zeros and empty lists for a student with no activity."""
    # Run queries sequentially — AsyncSession is not concurrency-safe
    xp_row     = await get_user_xp(db, user_id)
    ep_row     = await get_user_edupoints(db, user_id)
    streak_row = await get_user_streak(db, user_id)
    badges     = await get_user_badges(db, user_id)
    goals      = await get_recent_daily_goals(db, user_id, days=14)
    challenges = await count_completed_challenges(db, user_id)
    xp_events  = await get_recent_xp_transactions(db, user_id, limit=50)

    return InternalStudentProfileResponse(
        user_id=user_id,
        xp={
            "total_xp": xp_row.total_xp if xp_row else 0,
            "level": xp_row.level if xp_row else 1,
        },
        edupoints={
            "balance": ep_row.balance if ep_row else 0,
            "total_earned": ep_row.total_earned if ep_row else 0,
            "total_spent": ep_row.total_spent if ep_row else 0,
        },
        streak={
            "current_streak": streak_row.current_streak if streak_row else 0,
            "longest_streak": streak_row.longest_streak if streak_row else 0,
            "last_activity_date": streak_row.last_activity_date if streak_row else None,
            "freeze_count": streak_row.freeze_count if streak_row else 0,
        },
        badges=[{"badge_type": b.badge_type.value, "earned_at": b.earned_at} for b in badges],
        daily_goals_recent=goals,
        challenges_completed=challenges,
        recent_xp_events=xp_events,
    )
