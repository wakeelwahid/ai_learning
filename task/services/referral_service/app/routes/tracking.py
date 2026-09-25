import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, require_internal
from app.crud.reward_crud import get_user_rewards
from app.database.session import get_db
from app.models.referral_code import ReferralCode
from app.routes.guards import ensure_self
from app.schemas.requests import QualificationUpdateRequest, RegisterReferralRequest
from app.schemas.responses import ReferralRewardResponse
from app.services.tracking_service import ReferralTrackingService

router = APIRouter(prefix="/referrals", tags=["referrals"])


@router.post("/register")
async def register_referral(
    body: RegisterReferralRequest,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    if body.referred_user_id != caller_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="referred_user_id must match the authenticated user",
        )
    service = ReferralTrackingService(db)
    referral = await service.register_referral(body.referral_code, caller_id)
    return {"registered": referral is not None}


@router.post("/qualify")
async def update_qualification(
    body: QualificationUpdateRequest,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    if body.referred_user_id != caller_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="referred_user_id must match the authenticated user",
        )
    service = ReferralTrackingService(db)
    result = await service.update_qualification(caller_id)
    return result


@router.put("/qualify")
async def update_qualification_put(
    body: QualificationUpdateRequest,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    """PUT alias — same logic as POST /qualify (gateway compatibility)."""
    if body.referred_user_id != caller_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="referred_user_id must match the authenticated user",
        )
    service = ReferralTrackingService(db)
    result = await service.update_qualification(caller_id)
    return result


@router.post("/internal/qualify", dependencies=[Depends(require_internal)], include_in_schema=False)
async def internal_update_qualification(
    body: QualificationUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Docker-network-only trigger: content_service (video watched) and
    quiz_service (quiz completed) call this on a genuine completion
    transition, with no end-user JWT to forward. No caller_id-matching
    guard here (unlike the JWT-authenticated /qualify above) — the caller
    IS the trusted internal service, not an end user; the referred_user_id
    it names is exactly whose progress just changed. update_qualification
    still re-derives the actual qualification state from real DB records,
    so this route can never be used to fake a qualification directly."""
    service = ReferralTrackingService(db)
    return await service.update_qualification(body.referred_user_id)


@router.get(
    "/internal/student/{user_id}/summary",
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
)
async def internal_student_summary(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """A student's own referral code, counts and rewards, for the
    parent-facing feature. Deliberately exposes only aggregate counts and
    this user's rewards — never the referred users' identities. Returns a
    zeroed payload (200, never 404) for a user who has no referral code;
    unlike GET /code/{user_id} it does not create one as a side effect."""
    code = (
        await db.execute(select(ReferralCode).where(ReferralCode.user_id == user_id))
    ).scalar_one_or_none()
    rewards = await get_user_rewards(db, user_id)
    return {
        "user_id": str(user_id),
        "code": code.code if code else None,
        "total_referrals": code.total_referrals if code else 0,
        "qualified_referrals": code.qualified_referrals if code else 0,
        "rewards": [r.model_dump() for r in rewards],
    }


@router.get("/rewards/{user_id}", response_model=list[ReferralRewardResponse])
async def get_rewards(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    caller_id: uuid.UUID = Depends(get_current_user_id),
):
    ensure_self(user_id, caller_id)
    return await get_user_rewards(db, user_id)
