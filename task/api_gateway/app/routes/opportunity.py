"""API Gateway — Opportunities Hub proxy routes.

The career service registers opportunities at /api/v1/careers/opportunities/...
This router exposes them at the flat /api/v1/opportunities/... path (as documented)
and rewrites the path before forwarding upstream.
"""
from fastapi import Request, Response, APIRouter

from app.core.rest_router import rest_router
from app.services import career_svc

router = APIRouter(prefix="/api/v1/opportunities", tags=["opportunities"])


def rewrite_path(path: str) -> str:
    return path.replace("/api/v1/opportunities", "/api/v1/careers/opportunities", 1)


@rest_router(router.get, path="/hub-summary", proxy=career_svc, forward_path=rewrite_path,
    summary="Category counts + featured items per category")
async def hub_summary(request: Request, response: Response):
    pass

@rest_router(router.get, path="/upcoming", proxy=career_svc, forward_path=rewrite_path,
    summary="Opportunities with deadlines in the next N days")
async def upcoming_opportunities(request: Request, response: Response):
    pass

@rest_router(router.post, path="/admin/create", proxy=career_svc, forward_path=rewrite_path,
    summary="[Admin] Create a new opportunity listing")
async def admin_create(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/admin/{opportunity_id}", proxy=career_svc, forward_path=rewrite_path,
    summary="[Admin] Partially update an opportunity")
async def admin_update(request: Request, response: Response, opportunity_id: str):
    pass

@rest_router(router.delete, path="/admin/{opportunity_id}", proxy=career_svc, forward_path=rewrite_path,
    summary="[Admin] Soft-deactivate an opportunity")
async def admin_delete(request: Request, response: Response, opportunity_id: str):
    pass

@rest_router(router.get, path="/{opportunity_id}", proxy=career_svc, forward_path=rewrite_path,
    summary="Get full opportunity detail by ID")
async def get_opportunity(request: Request, response: Response, opportunity_id: str):
    pass

@rest_router(router.get, path="", proxy=career_svc, forward_path=rewrite_path,
    summary="List opportunities with optional filters")
async def list_opportunities(request: Request, response: Response):
    pass
