from fastapi import APIRouter

from app.routes.user import router as user_router
from app.routes.parent_features import router as parent_features_router
from app.routes.messages import router as messages_router
from app.routes.community import router as community_router
from app.routes.internal import router as internal_router
from app.routes.chat import router as chat_router
from app.routes.chat_ws import router as ws_router

# Each sub-router keeps the exact mount prefix it had in the pre-refactor
# main.py (they are not uniform — messages/chat mount under /users, ws has
# no prefix at all) since this is a pure structural move, not a routing
# change.
api_router = APIRouter()
api_router.include_router(user_router, prefix="/api/v1")
api_router.include_router(parent_features_router, prefix="/api/v1")
api_router.include_router(messages_router, prefix="/api/v1/users")
api_router.include_router(chat_router, prefix="/api/v1/users")
api_router.include_router(community_router, prefix="/api/v1")
api_router.include_router(internal_router, prefix="/api/v1")
api_router.include_router(ws_router)
