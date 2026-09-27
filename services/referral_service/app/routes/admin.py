from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.crud.admin_crud import get_admin_overview, get_all_codes, get_all_referrals
from app.database.session import get_db
from app.models.enums import ReferralStatus
from app.schemas.responses import AdminOverviewResponse

router = APIRouter(prefix="/referrals", tags=["referrals"])


@router.get("/admin/overview", response_model=AdminOverviewResponse, dependencies=[Depends(require_admin)])
async def admin_overview(db: AsyncSession = Depends(get_db)):
    return await get_admin_overview(db)


@router.get("/admin/all-codes", dependencies=[Depends(require_admin)])
async def admin_all_codes(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """All referral codes with full stats — for admin user table."""
    codes, total = await get_all_codes(db, page, limit)
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "codes": [
            {
                "user_id":             str(c.user_id),
                "code":                c.code,
                "total_referrals":     c.total_referrals,
                "qualified_referrals": c.qualified_referrals,
                "created_at":          c.created_at.isoformat(),
            }
            for c in codes
        ],
    }


@router.get("/admin/all-referrals", dependencies=[Depends(require_admin)])
async def admin_all_referrals(
    status: ReferralStatus | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """All individual referral records for admin tracking."""
    refs, total, funnel = await get_all_referrals(db, status, page, limit)

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "funnel": {
            "total":     int(funnel.total or 0),
            "signup":    int(funnel.signup or 0),
            "email":     int(funnel.email or 0),
            "video":     int(funnel.video or 0),
            "quiz":      int(funnel.quiz or 0),
            "qualified": int(funnel.qualified or 0),
            "rewarded":  int(funnel.rewarded or 0),
        },
        "referrals": [
            {
                "id":               str(r.id),
                "referrer_id":      str(r.referrer_id),
                "referred_id":      str(r.referred_id),
                "referral_code":    r.referral_code,
                "status":           r.status.value,
                "signup_completed": r.signup_completed,
                "email_verified":   r.email_verified,
                "video_watched":    r.video_watched,
                "quiz_completed":   r.quiz_completed,
                "qualified_at":     r.qualified_at.isoformat() if r.qualified_at else None,
                "created_at":       r.created_at.isoformat(),
            }
            for r in refs
        ],
    }
