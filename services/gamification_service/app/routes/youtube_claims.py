import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, is_admin_role, require_admin, verify_owner_or_admin
from app.crud.gamification_crud import (
    commit_youtube_claim_review,
    create_youtube_claim,
    get_youtube_claim_by_id,
    get_youtube_claim_by_user,
    list_youtube_claims as crud_list_youtube_claims,
)
from app.database.session import get_db
from app.models.gamification import ClaimStatus, EduPointEvent
from app.routes._common import peek_role
from app.schemas.gamification import YoutubeClaimReview, YoutubeClaimStatus, YoutubeClaimSubmit
from app.services.gamification_service import EduPointsService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── YouTube Subscribe Claims ──────────────────────────────────────────────────

@router.post("/youtube-subscribe/claim", status_code=201)
async def submit_youtube_claim(
    body: YoutubeClaimSubmit,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
    _role: str = Depends(peek_role),
):
    """Student submits YouTube subscription proof (base64 screenshot). One per account.

    Phase 11: Only admins or the authenticated user themselves may submit a
    claim for a given user_id. Prevents IDOR where a user could forge
    body.user_id to submit a claim under another user's account.
    """
    if current_user_id != body.user_id and not is_admin_role(_role):
        raise HTTPException(status_code=403, detail="Cannot submit a YouTube claim for another user.")
    existing = await get_youtube_claim_by_user(db, body.user_id)
    if existing:
        raise HTTPException(status_code=409, detail="You have already submitted a YouTube subscribe claim.")
    claim = await create_youtube_claim(db, body.user_id, body.screenshot_b64)
    return {"id": str(claim.id), "status": claim.status.value, "message": "Claim submitted. Awaiting admin review."}


@router.get("/youtube-subscribe/claim/{user_id}", response_model=YoutubeClaimStatus, dependencies=[Depends(verify_owner_or_admin)])
async def get_youtube_claim_status(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return current claim status for a user (status=None if no claim yet)."""
    claim = await get_youtube_claim_by_user(db, user_id)
    if not claim:
        return YoutubeClaimStatus()
    return YoutubeClaimStatus(
        id=claim.id, status=claim.status.value,
        created_at=claim.created_at, reviewed_at=claim.reviewed_at,
        review_note=claim.review_note,
    )


@router.get("/youtube-subscribe/claims", dependencies=[Depends(require_admin)])
async def list_youtube_claims(
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] List all YouTube subscribe claims, optionally filtered by status."""
    try:
        claims = await crud_list_youtube_claims(db, status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    return [
        {
            "id": str(c.id),
            "user_id": str(c.user_id),
            "status": c.status.value,
            "screenshot_b64": c.screenshot_b64,
            "review_note": c.review_note,
            "created_at": c.created_at.isoformat(),
            "reviewed_at": c.reviewed_at.isoformat() if c.reviewed_at else None,
        }
        for c in claims
    ]


@router.post("/youtube-subscribe/claims/{claim_id}/approve", dependencies=[Depends(require_admin)])
async def approve_youtube_claim(
    claim_id: uuid.UUID,
    body: YoutubeClaimReview,
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Approve a claim → award 500 EduPoints to the user."""
    claim = await get_youtube_claim_by_id(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != ClaimStatus.PENDING:
        raise HTTPException(status_code=409, detail="Claim already reviewed")

    claim.status = ClaimStatus.APPROVED
    claim.reviewed_at = datetime.now(timezone.utc)
    claim.review_note = body.note

    svc = EduPointsService(db)
    result_data = await svc.award(
        user_id=claim.user_id,
        event=EduPointEvent.YOUTUBE_VERIFIED,
        reference_id=str(claim_id),
    )
    await commit_youtube_claim_review(db)
    return {"message": "Approved", "edu_points_awarded": result_data["points_awarded"]}


@router.post("/youtube-subscribe/claims/{claim_id}/reject", dependencies=[Depends(require_admin)])
async def reject_youtube_claim(
    claim_id: uuid.UUID,
    body: YoutubeClaimReview,
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Reject a claim. User may NOT resubmit (one attempt per account)."""
    claim = await get_youtube_claim_by_id(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != ClaimStatus.PENDING:
        raise HTTPException(status_code=409, detail="Claim already reviewed")

    claim.status = ClaimStatus.REJECTED
    claim.reviewed_at = datetime.now(timezone.utc)
    claim.review_note = body.note or "Screenshot did not meet requirements"
    await commit_youtube_claim_review(db)
    return {"message": "Rejected"}
