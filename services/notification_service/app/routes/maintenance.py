from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.crud.maintenance_crud import get_or_create, update_maintenance
from app.database.session import get_db
from app.utils.response import APIResponse
from app.schemas.maintenance import MaintenanceResponse, MaintenanceSet

router = APIRouter(prefix="/maintenance", tags=["Maintenance"])


@router.get("", response_model=APIResponse)
async def get_maintenance(db: AsyncSession = Depends(get_db)):
    """Get current maintenance status — public endpoint, no auth required."""
    obj = await get_or_create(db)
    return APIResponse.ok(data=MaintenanceResponse.model_validate(obj).model_dump(), message="OK")


@router.post("", response_model=APIResponse, dependencies=[Depends(require_admin)])
async def set_maintenance(body: MaintenanceSet, db: AsyncSession = Depends(get_db)):
    """[Admin] Enable or disable maintenance mode."""
    obj = await update_maintenance(db, body.is_active, body.title, body.message, body.ends_at, body.updated_by)
    return APIResponse.ok(
        data=MaintenanceResponse.model_validate(obj).model_dump(),
        message="Maintenance mode enabled" if body.is_active else "Maintenance mode disabled",
    )
