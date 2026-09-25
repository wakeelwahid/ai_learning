from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.database.session import get_db
from app.services.battle_query_service import BattleQueryService

router = APIRouter(prefix="/battles", tags=["battles"])


@router.get("/admin/stats", dependencies=[Depends(require_admin)])
async def battle_admin_stats(db: AsyncSession = Depends(get_db)):
    """Admin: aggregate battle stats — total, by status, by type."""
    svc = BattleQueryService(db)
    return await svc.get_admin_stats()


@router.get("", dependencies=[Depends(require_admin)])
async def list_battles_admin(
    status: str | None = Query(default=None),
    battle_type: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list all battles with optional filters."""
    svc = BattleQueryService(db)
    return await svc.list_battles_admin(status, battle_type, page, limit)
