from fastapi import Request, Response, APIRouter

from app.core.rest_router import rest_router
from app.services import battle_svc

router = APIRouter(prefix="/api/v1/battles", tags=["battles"])


@rest_router(router.get, path="", proxy=battle_svc)
async def list_battles(request: Request, response: Response):
    pass

@rest_router(router.get, path="/my", proxy=battle_svc)
async def get_my_battles(request: Request, response: Response):
    pass

@rest_router(router.get, path="/admin/stats", proxy=battle_svc)
async def battle_admin_stats(request: Request, response: Response):
    pass

@rest_router(router.get, path="/open", proxy=battle_svc)
async def list_open_battles(request: Request, response: Response):
    pass

@rest_router(router.get, path="/stats/{user_id}", proxy=battle_svc)
async def battle_stats(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/history/{user_id}", proxy=battle_svc)
async def battle_history(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/leaderboard/global", proxy=battle_svc)
async def battle_leaderboard(request: Request, response: Response):
    pass

@rest_router(router.post, path="/seed", proxy=battle_svc)
async def seed_battles(request: Request, response: Response):
    pass

@rest_router(router.post, path="", proxy=battle_svc)
async def create_battle(request: Request, response: Response):
    pass

@rest_router(router.post, path="/join", proxy=battle_svc)
async def join_battle(request: Request, response: Response):
    pass

@rest_router(router.post, path="/challenge", proxy=battle_svc)
async def challenge_friend(request: Request, response: Response):
    pass

@rest_router(router.get, path="/{battle_id}", proxy=battle_svc)
async def get_battle(request: Request, response: Response, battle_id: str):
    pass

@rest_router(router.post, path="/{battle_id}/join", proxy=battle_svc)
async def join_battle_direct(request: Request, response: Response, battle_id: str):
    pass

@rest_router(router.post, path="/{battle_id}/join-by-id", proxy=battle_svc)
async def join_battle_by_id(request: Request, response: Response, battle_id: str):
    pass

@rest_router(router.post, path="/{battle_id}/start", proxy=battle_svc)
async def start_battle(request: Request, response: Response, battle_id: str):
    pass

@rest_router(router.post, path="/{battle_id}/regenerate-questions", proxy=battle_svc)
async def regenerate_questions(request: Request, response: Response, battle_id: str):
    pass

@rest_router(router.post, path="/{battle_id}/answer", proxy=battle_svc)
async def submit_answer(request: Request, response: Response, battle_id: str):
    pass

@rest_router(router.post, path="/{battle_id}/finish", proxy=battle_svc)
async def finish_battle(request: Request, response: Response, battle_id: str):
    pass

@rest_router(router.post, path="/{battle_id}/rematch", proxy=battle_svc)
async def create_rematch(request: Request, response: Response, battle_id: str):
    pass

@rest_router(router.get, path="/{battle_id}/review", proxy=battle_svc)
async def get_battle_review(request: Request, response: Response, battle_id: str):
    pass

@rest_router(router.get, path="/{battle_id}/replay", proxy=battle_svc)
async def get_battle_replay(request: Request, response: Response, battle_id: str):
    pass

@rest_router(router.post, path="/{battle_id}/spectate", proxy=battle_svc)
async def join_as_spectator(request: Request, response: Response, battle_id: str):
    pass
