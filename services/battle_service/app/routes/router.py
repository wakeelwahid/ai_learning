from fastapi import APIRouter

from app.routes.admin import router as admin_router
from app.routes.gameplay import router as gameplay_router
from app.routes.lifecycle import router as lifecycle_router
from app.routes.queries import router as queries_router
from app.routes.websocket import router as websocket_router

api_router = APIRouter()
api_router.include_router(lifecycle_router)
api_router.include_router(admin_router)
api_router.include_router(queries_router)
api_router.include_router(gameplay_router)
api_router.include_router(websocket_router)
