from fastapi import Request, Response, APIRouter

from app.core.rest_router import rest_router
from app.services import user_svc

router = APIRouter(prefix="/api/v1/community", tags=["Community"])


# ── Friends ────────────────────────────────────────────────────────────────────

@rest_router(router.post, path="/friends/request", proxy=user_svc, status_code=201,
    summary="Send a friend request")
async def friend_request(request: Request, response: Response):
    pass

@rest_router(router.get, path="/friends/requests", proxy=user_svc,
    summary="List pending friend requests")
async def friend_requests(request: Request, response: Response):
    pass

@rest_router(router.post, path="/friends/accept", proxy=user_svc,
    summary="Accept a friend request")
async def friend_accept(request: Request, response: Response):
    pass

@rest_router(router.get, path="/friends", proxy=user_svc,
    summary="List accepted friends")
async def friends(request: Request, response: Response):
    pass


# ── Direct Messages ────────────────────────────────────────────────────────────

@rest_router(router.get, path="/messages/conversations", proxy=user_svc,
    summary="List all DM conversations")
async def conversations(request: Request, response: Response):
    pass

@rest_router(router.get, path="/messages/{user_id}", proxy=user_svc,
    summary="Get DM thread with a user")
async def thread(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.post, path="/messages", proxy=user_svc, status_code=201,
    summary="Send a direct message")
async def send_message(request: Request, response: Response):
    pass


# ── Groups ─────────────────────────────────────────────────────────────────────

@rest_router(router.post, path="/groups", proxy=user_svc, status_code=201,
    summary="Create a study group")
async def create_group(request: Request, response: Response):
    pass

@rest_router(router.get, path="/groups", proxy=user_svc,
    summary="List groups for current user")
async def list_groups(request: Request, response: Response):
    pass
