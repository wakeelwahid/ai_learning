from fastapi import APIRouter

from app.routes.activity import router as activity_router
from app.routes.admin import router as admin_router
from app.routes.dashboard import router as dashboard_router
from app.routes.leaderboard import router as leaderboard_router
from app.routes.parent import router as parent_router
from app.routes.performance_cache import router as performance_cache_router
from app.routes.progress_recording import router as progress_recording_router
from app.routes.revision import router as revision_router
from app.routes.teacher import router as teacher_router

api_router = APIRouter()
api_router.include_router(progress_recording_router)
api_router.include_router(activity_router)
api_router.include_router(dashboard_router)
api_router.include_router(revision_router)
api_router.include_router(performance_cache_router)
api_router.include_router(leaderboard_router)
api_router.include_router(parent_router)
api_router.include_router(teacher_router)
api_router.include_router(admin_router)
