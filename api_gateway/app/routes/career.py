"""API Gateway — Career Service proxy routes."""
from fastapi import Request, Response, APIRouter

from app.core.rest_router import rest_router
from app.services import career_svc

router = APIRouter(prefix="/api/v1/careers", tags=["careers"])


# ── Opportunities Hub (must be before /{career_id} wildcard) ──────────────────

@rest_router(router.get, path="/opportunities/hub-summary", proxy=career_svc)
async def opportunities_hub_summary(request: Request, response: Response):
    pass

@rest_router(router.get, path="/opportunities/upcoming", proxy=career_svc)
async def opportunities_upcoming(request: Request, response: Response):
    pass

@rest_router(router.get, path="/opportunities", proxy=career_svc)
async def list_opportunities(request: Request, response: Response):
    pass

@rest_router(router.post, path="/opportunities/admin/create", proxy=career_svc)
async def admin_create_opportunity(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/opportunities/admin/{opportunity_id}", proxy=career_svc)
async def admin_update_opportunity(request: Request, response: Response, opportunity_id: str):
    pass

@rest_router(router.delete, path="/opportunities/admin/{opportunity_id}", proxy=career_svc)
async def admin_deactivate_opportunity(request: Request, response: Response, opportunity_id: str):
    pass

@rest_router(router.get, path="/opportunities/{opportunity_id}", proxy=career_svc)
async def get_opportunity(request: Request, response: Response, opportunity_id: str):
    pass


# ── Career Guidance ───────────────────────────────────────────────────────────

@rest_router(router.get, path="/categories", proxy=career_svc)
async def career_categories(request: Request, response: Response):
    pass

@rest_router(router.get, path="/dashboard/my", proxy=career_svc)
async def career_dashboard(request: Request, response: Response):
    pass

@rest_router(router.get, path="/goals/my", proxy=career_svc)
async def career_goals(request: Request, response: Response):
    pass

@rest_router(router.post, path="/goals/set", proxy=career_svc)
async def set_career_goal(request: Request, response: Response):
    pass

@rest_router(router.delete, path="/goals/{career_id}", proxy=career_svc)
async def delete_career_goal(request: Request, response: Response, career_id: str):
    pass

@rest_router(router.post, path="/skill-gap", proxy=career_svc)
async def career_skill_gap(request: Request, response: Response):
    pass

@rest_router(router.get, path="/skill-gap/{career_id}/latest", proxy=career_svc)
async def career_skill_gap_latest(request: Request, response: Response, career_id: str):
    pass

@rest_router(router.get, path="", proxy=career_svc)
async def list_careers(request: Request, response: Response):
    pass

@rest_router(router.get, path="/{career_id}", proxy=career_svc)
async def get_career(request: Request, response: Response, career_id: str):
    pass
