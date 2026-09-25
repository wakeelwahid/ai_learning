from fastapi import APIRouter

from app.routes.admin import router as admin_router
from app.routes.code import router as code_router
from app.routes.tracking import router as tracking_router

api_router = APIRouter()
api_router.include_router(code_router)
api_router.include_router(tracking_router)
api_router.include_router(admin_router)
