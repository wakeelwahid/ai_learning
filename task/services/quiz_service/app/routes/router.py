from fastapi import APIRouter

from app.routes.admin import router as admin_router
from app.routes.attempts import router as attempts_router
from app.routes.authoring import router as authoring_router
from app.routes.discovery import router as discovery_router
from app.routes.leaderboard import router as leaderboard_router
from app.routes.quiz_detail import router as quiz_detail_router

api_router = APIRouter()
api_router.include_router(discovery_router)
api_router.include_router(admin_router)
api_router.include_router(leaderboard_router)
api_router.include_router(attempts_router)
api_router.include_router(authoring_router)
api_router.include_router(quiz_detail_router)  # wildcard /{quiz_id} routes — MUST be last
