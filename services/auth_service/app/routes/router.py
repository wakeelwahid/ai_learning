from fastapi import APIRouter

from app.routes.registration import router as registration_router
from app.routes.phone_otp import router as phone_otp_router
from app.routes.internal import router as internal_router
from app.routes.session import router as session_router
from app.routes.device_sessions import router as device_sessions_router
from app.routes.verify import router as verify_router
from app.routes.account import router as account_router
from app.routes.admin_users import router as admin_users_router
from app.routes.oauth_google import router as oauth_google_router

api_router = APIRouter()
api_router.include_router(registration_router)
api_router.include_router(phone_otp_router)
api_router.include_router(internal_router)
api_router.include_router(session_router)
api_router.include_router(device_sessions_router)
api_router.include_router(verify_router)
api_router.include_router(account_router)
api_router.include_router(admin_users_router)
api_router.include_router(oauth_google_router)
