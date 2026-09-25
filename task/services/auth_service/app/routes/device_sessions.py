import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.services.session_service import SessionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Device Sessions ───────────────────────────────────────────────────────────

@router.get("/sessions", summary="List active device sessions")
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SessionService(db)
    return await service.list_active_sessions(current_user.id)


@router.delete("/sessions/{session_id}", summary="Revoke a device session")
async def revoke_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SessionService(db)
    await service.revoke_device_session(session_id, current_user.id)
    return {"revoked": True}
