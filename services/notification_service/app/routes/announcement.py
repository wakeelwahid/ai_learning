from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.crud import announcement_crud
from app.database.session import get_db
from app.utils.response import APIResponse
from app.schemas.announcement import AnnouncementCreate, AnnouncementResponse, AnnouncementUpdate

router = APIRouter(prefix="/announcements", tags=["Announcements"])


@router.get("", response_model=APIResponse)
async def list_announcements(
    active_only: bool = Query(True, description="Only return active, non-expired announcements"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List announcements — pinned first, then by release_date desc."""
    rows = await announcement_crud.list_announcements(db, active_only, limit)
    return APIResponse.ok(
        data=[AnnouncementResponse.model_validate(r).model_dump() for r in rows],
        message=f"{len(rows)} announcement(s)",
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=APIResponse, dependencies=[Depends(require_admin)])
async def create_announcement(
    body: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Create a new announcement."""
    obj = await announcement_crud.create_announcement(db, body)
    return APIResponse.ok(
        data=AnnouncementResponse.model_validate(obj).model_dump(),
        message="Announcement created",
    )


@router.put("/{announcement_id}", response_model=APIResponse, dependencies=[Depends(require_admin)])
async def update_announcement(
    announcement_id: UUID,
    body: AnnouncementUpdate,
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Update an existing announcement."""
    obj = await announcement_crud.get_announcement(db, announcement_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Announcement not found")
    obj = await announcement_crud.update_announcement(db, obj, body.model_dump(exclude_unset=True))
    return APIResponse.ok(
        data=AnnouncementResponse.model_validate(obj).model_dump(),
        message="Announcement updated",
    )


@router.delete("/{announcement_id}", response_model=APIResponse, dependencies=[Depends(require_admin)])
async def delete_announcement(
    announcement_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Delete an announcement."""
    obj = await announcement_crud.get_announcement(db, announcement_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Announcement not found")
    await announcement_crud.delete_announcement(db, obj)
    return APIResponse.ok(message="Announcement deleted")
