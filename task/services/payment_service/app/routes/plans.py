"""Public subscription plan listing (admin-managed via /admin/plans)."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import plan_crud
from app.database.session import get_db
from app.schemas.plan import PlanResponse

router = APIRouter(prefix="/payments", tags=["payments"])


# ── Plans (public, dynamic — admin-managed via /admin/plans) ──────────────────

@router.get("/plans", response_model=list[PlanResponse], summary="List available subscription plans")
async def list_plans(db: AsyncSession = Depends(get_db)):
    plans = await plan_crud.list_active_plans(db)
    return [PlanResponse.from_model(p) for p in plans]
