from sqlalchemy import func, select
from sqlalchemy.types import Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ReferralStatus
from app.models.referral import Referral
from app.models.referral_code import ReferralCode
from app.schemas.responses import AdminOverviewResponse, TopReferrerResponse


async def get_admin_overview(db: AsyncSession) -> AdminOverviewResponse:
    total_codes = await db.scalar(select(func.count(ReferralCode.id)))
    total_referrals = await db.scalar(select(func.sum(ReferralCode.total_referrals)))
    total_qualified = await db.scalar(select(func.sum(ReferralCode.qualified_referrals)))

    top_result = await db.execute(
        select(ReferralCode).order_by(ReferralCode.total_referrals.desc()).limit(20)
    )
    top_referrers = top_result.scalars().all()

    return AdminOverviewResponse(
        total_referrers=int(total_codes or 0),
        total_referrals=int(total_referrals or 0),
        total_qualified=int(total_qualified or 0),
        top_referrers=[
            TopReferrerResponse(
                user_id=str(r.user_id),
                code=r.code,
                total_referrals=r.total_referrals,
                qualified_referrals=r.qualified_referrals,
            )
            for r in top_referrers
        ],
    )


async def get_all_codes(db: AsyncSession, page: int, limit: int) -> tuple[list[ReferralCode], int]:
    result = await db.execute(
        select(ReferralCode)
        .order_by(ReferralCode.total_referrals.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    codes = result.scalars().all()
    total = await db.scalar(select(func.count(ReferralCode.id)))
    return codes, total or 0


async def get_all_referrals(db: AsyncSession, status: ReferralStatus | None, page: int, limit: int):
    q = select(Referral)
    if status:
        q = q.where(Referral.status == status)
    q = q.order_by(Referral.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    refs = result.scalars().all()
    total = await db.scalar(select(func.count(Referral.id)))

    funnel_res = await db.execute(
        select(
            func.count(Referral.id).label("total"),
            func.sum(Referral.signup_completed.cast(Integer)).label("signup"),
            func.sum(Referral.email_verified.cast(Integer)).label("email"),
            func.sum(Referral.video_watched.cast(Integer)).label("video"),
            func.sum(Referral.quiz_completed.cast(Integer)).label("quiz"),
            func.sum((Referral.status == ReferralStatus.QUALIFIED).cast(Integer)).label("qualified"),
            func.sum((Referral.status == ReferralStatus.REWARDED).cast(Integer)).label("rewarded"),
        )
    )
    funnel = funnel_res.one()
    return refs, total or 0, funnel
