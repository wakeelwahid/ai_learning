"""Career dashboard API routes."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id
from app.database.session import get_db
from app.services.career_dashboard_service import CareerDashboardService

router = APIRouter(prefix="/careers", tags=["careers"])


@router.get("/dashboard/my")
async def get_dashboard(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    svc = CareerDashboardService(db)
    return await svc.get_dashboard(user_id)
