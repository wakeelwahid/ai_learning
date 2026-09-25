from fastapi import Request, Response, APIRouter

from app.core.rest_router import rest_router
from app.services import referral_svc
from app.schemas import RegisterReferralRequest

router = APIRouter(prefix="/api/v1/referrals", tags=["Referrals"])


@rest_router(router.get, path="/code/{user_id}", proxy=referral_svc,
    summary="Get or generate a referral code for a user")
async def get_code(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.post, path="/register", proxy=referral_svc,
    summary="Record that a user signed up with a referral code")
async def register_referral(request: Request, response: Response, data: RegisterReferralRequest):
    pass

@rest_router(router.post, path="/qualify", proxy=referral_svc,
    summary="Update qualification flags for a referral (POST)")
async def qualify_referral_post(request: Request, response: Response):
    pass

@rest_router(router.put, path="/qualify", proxy=referral_svc,
    summary="Update qualification flags for a referral (PUT)")
async def qualify_referral(request: Request, response: Response):
    pass

@rest_router(router.get, path="/rewards/{user_id}", proxy=referral_svc,
    summary="List milestone rewards unlocked by a user")
async def get_rewards(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/stats/{user_id}", proxy=referral_svc,
    summary="Full referral stats for a user")
async def get_stats(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/admin/overview", proxy=referral_svc,
    summary="[Admin] Platform-wide referral statistics")
async def admin_overview(request: Request, response: Response):
    pass

@rest_router(router.get, path="/admin/all-codes", proxy=referral_svc,
    summary="[Admin] All referral codes with user stats")
async def admin_all_codes(request: Request, response: Response):
    pass

@rest_router(router.get, path="/admin/all-referrals", proxy=referral_svc,
    summary="[Admin] All individual referral records + funnel")
async def admin_all_referrals(request: Request, response: Response):
    pass
