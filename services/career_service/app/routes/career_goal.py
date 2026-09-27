"""Career goal API routes."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import bearer, get_current_user_id
from app.database.session import get_db
from app.schemas.career_goal import SetGoalRequest
from app.services.career_goal_service import CareerGoalService

router = APIRouter(prefix="/careers", tags=["careers"])


@router.post("/goals/set")
async def set_goal(
    body: SetGoalRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    svc = CareerGoalService(db)
    try:
        goal = await svc.set_goal(
            user_id=user_id,
            career_id=body.career_id,
            is_primary=body.is_primary,
            notes=body.notes,
            bearer_token=f"Bearer {creds.credentials}" if creds else None,
        )
        return {
            "id": str(goal.id), "user_id": str(goal.user_id),
            "career_id": str(goal.career_id), "is_primary": goal.is_primary,
            "progress": goal.progress, "notes": goal.notes,
            "created_at": goal.created_at.isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/goals/my")
async def get_my_goals(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    svc = CareerGoalService(db)
    goals = await svc.get_goals(user_id)
    return {"goals": goals}


@router.delete("/goals/{career_id}")
async def delete_goal(
    career_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    svc = CareerGoalService(db)
    deleted = await svc.delete_goal(user_id, career_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"deleted": True}
