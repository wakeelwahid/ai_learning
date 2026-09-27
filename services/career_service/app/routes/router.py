from fastapi import APIRouter

from app.routes.career_catalog import router as career_catalog_router
from app.routes.career_dashboard import router as career_dashboard_router
from app.routes.career_goal import router as career_goal_router
from app.routes.internal import router as internal_router
from app.routes.opportunity import router as opportunity_router
from app.routes.skill_gap import router as skill_gap_router

api_router = APIRouter()

# opportunity_router (internal prefix /opportunities) is mounted under
# /careers here so it must be registered before the career routers below —
# career_catalog_router's GET /careers/{career_id_or_slug} is a wildcard path
# param that would otherwise swallow requests to /careers/opportunities/*
# (matching "opportunities" as career_id_or_slug).
api_router.include_router(opportunity_router, prefix="/careers")

# Same wildcard hazard: /careers/internal/* must be registered before
# career_catalog_router or "internal" matches as career_id_or_slug.
api_router.include_router(internal_router)

# The career routers below preserve the exact route registration order of the
# original single career.py module: catalog (including the
# /careers/{career_id_or_slug} wildcard) first, then goals, skill-gap and
# dashboard. FastAPI resolves routes in registration order, so this ordering is
# behaviour-critical and must not be rearranged.
api_router.include_router(career_catalog_router)
api_router.include_router(career_goal_router)
api_router.include_router(skill_gap_router)
api_router.include_router(career_dashboard_router)
