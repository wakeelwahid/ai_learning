import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, is_admin_role, require_admin, verify_owner_or_admin
from app.crud.gamification_crud import get_challenge_by_date
from app.database.session import get_db
from app.models.gamification import EduPointEvent, XPEvent
from app.routes._common import peek_role
from app.schemas.gamification import (
    ChallengeProgressResponse,
    ClaimRewardRequest,
    CreateChallengeRequest,
    DailyChallengeResponse,
    RecordProgressRequest,
)
from app.services.gamification_service import DailyChallengeService, EduPointsService, GamificationService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Daily Challenge endpoints ─────────────────────────────────────────────────

@router.get("/challenges/today", response_model=DailyChallengeResponse | None)
async def get_today_challenge(db: AsyncSession = Depends(get_db)):
    """Return today's active daily challenge (or null if none published yet)."""
    return await DailyChallengeService(db).get_today()


@router.get("/challenges/today/{user_id}", response_model=ChallengeProgressResponse | None, dependencies=[Depends(verify_owner_or_admin)])
async def get_today_challenge_with_progress(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Today's challenge + this user's progress/completion status."""
    svc = DailyChallengeService(db)
    challenge = await svc.get_today()
    if not challenge:
        return None
    prog = await svc.get_user_progress(user_id, challenge.id)
    return ChallengeProgressResponse(
        challenge=DailyChallengeResponse.model_validate(challenge),
        progress=prog.progress if prog else 0,
        target=challenge.target_count,
        completed=prog.completed if prog else False,
        rewarded=prog.rewarded if prog else False,
        completed_at=prog.completed_at if prog else None,
    )


@router.post("/challenges/progress", response_model=dict)
async def record_challenge_progress(
    body: RecordProgressRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(peek_role),
):
    """Record progress toward a challenge (e.g. answered a quiz question).

    Phase 11: Only admins or the authenticated user themselves may record
    challenge progress for a given user_id. Prevents IDOR where a user
    could forge body.user_id to manipulate another user's progress.
    """
    if current_user_id != body.user_id and not is_admin_role(_role):
        raise HTTPException(status_code=403, detail="Cannot record challenge progress for another user.")
    result = await DailyChallengeService(db).record_progress(
        body.user_id, body.challenge_id, body.increment
    )
    await db.commit()
    return result


@router.post("/challenges/claim", response_model=dict)
async def claim_challenge_reward(
    body: ClaimRewardRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(peek_role),
):
    """
    Claim XP + EduPoints for a completed challenge.
    Caller is responsible for then calling /xp/award and /edupoints/award.

    Phase 11: Only admins or the authenticated user themselves may claim a
    challenge reward for a given user_id. Prevents IDOR where a user could
    forge body.user_id to claim another user's reward.
    """
    if current_user_id != body.user_id and not is_admin_role(_role):
        raise HTTPException(status_code=403, detail="Cannot claim challenge rewards for another user.")
    svc = DailyChallengeService(db)
    rewards = await svc.claim_reward(body.user_id, body.challenge_id)
    # Award XP + EduPoints inline (synchronous here — rewards are small).
    # claim_reward() above already guards against double-claiming via
    # prog.rewarded, but passing challenge_id as reference_id too gives the
    # same (user_id, event, reference_id) dedup as every other award path.
    ref = str(body.challenge_id)
    await GamificationService(db).award_xp(body.user_id, XPEvent.REVISION_COMPLETE, ref)
    await EduPointsService(db).award(body.user_id, EduPointEvent.REVISION_COMPLETE, ref)
    await db.commit()
    return rewards


@router.post("/challenges/admin/create", response_model=DailyChallengeResponse, dependencies=[Depends(require_admin)])
async def create_challenge(body: CreateChallengeRequest, db: AsyncSession = Depends(get_db)):
    """Admin endpoint: publish a daily challenge."""
    svc = DailyChallengeService(db)
    try:
        challenge = await svc.create_challenge(
            challenge_date=body.challenge_date,
            challenge_type=body.challenge_type,
            title=body.title,
            description=body.description,
            xp_reward=body.xp_reward,
            ep_reward=body.ep_reward,
            target_ref=body.target_ref,
            target_count=body.target_count,
        )
        # Validate before commit so ORM attributes are still loaded
        response = DailyChallengeResponse.model_validate(challenge)
        await db.commit()
        return response
    except IntegrityError:
        await db.rollback()
        # Unique constraint on challenge_date — fetch and return existing row
        existing = await get_challenge_by_date(db, body.challenge_date)
        if existing:
            return DailyChallengeResponse.model_validate(existing)
        raise HTTPException(status_code=409, detail="A challenge for this date already exists")


@router.get("/challenges/weekly/{user_id}", response_model=dict, dependencies=[Depends(verify_owner_or_admin)])
async def get_weekly_stats(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await DailyChallengeService(db).get_weekly_stats(user_id)


@router.get("/challenges/monthly/{user_id}", response_model=dict, dependencies=[Depends(verify_owner_or_admin)])
async def get_monthly_stats(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await DailyChallengeService(db).get_monthly_stats(user_id)
