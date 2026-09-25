import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, require_internal
from app.crud import activity_crud
from app.database.session import get_db
from app.schemas.activity import (
    ActivityDayResponse,
    ActivityTodayResponse,
    HeartbeatRequest,
    HeartbeatResponse,
    InternalActivityRequest,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post("/internal/activity", response_model=ActivityDayResponse,
             dependencies=[Depends(require_internal)])
async def internal_record_activity(
    body: InternalActivityRequest,
    db: AsyncSession = Depends(get_db),
) -> ActivityDayResponse:
    row = await activity_crud.upsert_increment(
        db,
        user_id=body.user_id,
        day=body.day,
        study_minutes=body.study_minutes,
        videos_watched=body.videos_watched,
        quizzes_completed=body.quizzes_completed,
        logged_in=body.logged_in,
    )
    return ActivityDayResponse(**activity_crud.activity_row_dict(row))


@router.post("/activity/heartbeat", response_model=HeartbeatResponse)
async def activity_heartbeat(
    body: HeartbeatRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> HeartbeatResponse:
    row = await activity_crud.upsert_increment(db, user_id=current_user_id, study_minutes=body.minutes)
    return HeartbeatResponse(used_today_minutes=row.study_minutes)


@router.get("/internal/activity/{user_id}/today", response_model=ActivityTodayResponse,
            dependencies=[Depends(require_internal)])
async def internal_activity_today(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ActivityTodayResponse:
    row = await activity_crud.get_day(db, user_id)
    return ActivityTodayResponse(**activity_crud.activity_row_dict(row))


@router.get("/internal/activity/{user_id}/range", response_model=list[ActivityDayResponse],
            dependencies=[Depends(require_internal)])
async def internal_activity_range(
    user_id: uuid.UUID,
    days: int = Query(default=30, ge=1, le=366),
    db: AsyncSession = Depends(get_db),
) -> list[ActivityDayResponse]:
    rows = await activity_crud.get_range(db, user_id, days)
    return [ActivityDayResponse(**activity_crud.activity_row_dict(r)) for r in rows]
