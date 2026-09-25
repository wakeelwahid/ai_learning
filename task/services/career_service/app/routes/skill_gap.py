"""Skill gap analysis API routes."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import bearer, get_current_user_id
from app.database.session import get_db
from app.schemas.skill_gap import SkillGapRequest
from app.services.skill_gap_service import SkillGapService

router = APIRouter(prefix="/careers", tags=["careers"])


@router.post("/skill-gap")
async def analyse_skill_gap(
    body: SkillGapRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyse how ready a student is for a career based on their subject scores.
    Returns ready_score, gaps, recommendations, and a personalised learning path.
    """
    svc = SkillGapService(db)
    try:
        result = await svc.analyse_skill_gap(
            user_id=user_id,
            career_id=body.career_id,
            student_scores=body.student_scores,
            bearer_token=f"Bearer {creds.credentials}" if creds else None,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")


@router.get("/skill-gap/{career_id}/latest")
async def get_latest_assessment(
    career_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    svc = SkillGapService(db)
    result = await svc.get_latest_assessment(user_id, career_id)
    if not result:
        return {"assessed": False, "career_id": str(career_id), "user_id": str(user_id)}
    return result
