"""Docker-network-only read routes for other EduLearn services.

Unlike every other career route (which takes the student from the caller's
JWT), these take the student as a path param — the caller is a trusted
internal service acting on a student's behalf, with no end-user token to
forward. Guarded by require_internal and hidden from the OpenAPI schema.
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_internal
from app.database.session import get_db
from app.models.career_catalog import Career
from app.models.career_goal import CareerGoal
from app.models.skill_assessment import SkillAssessment

router = APIRouter(prefix="/careers", tags=["careers"])

RECENT_ASSESSMENTS = 5


async def _career_titles(db: AsyncSession, career_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Resolve every referenced career name in one query, never per row."""
    if not career_ids:
        return {}
    res = await db.execute(select(Career.id, Career.title).where(Career.id.in_(career_ids)))
    return dict(res.all())


@router.get(
    "/internal/student/{user_id}/profile",
    dependencies=[Depends(require_internal)],
    include_in_schema=False,
)
async def student_career_profile(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """A student's career goals and recent skill assessments. Returns an
    empty payload (200, never 404) for a student with no career data."""
    goals = (
        await db.execute(
            select(CareerGoal)
            .where(CareerGoal.user_id == user_id)
            .order_by(CareerGoal.is_primary.desc(), CareerGoal.created_at.desc())
        )
    ).scalars().all()

    assessments = (
        await db.execute(
            select(SkillAssessment)
            .where(SkillAssessment.user_id == user_id)
            .order_by(SkillAssessment.assessed_at.desc())
            .limit(RECENT_ASSESSMENTS)
        )
    ).scalars().all()

    titles = await _career_titles(
        db, {r.career_id for r in goals} | {r.career_id for r in assessments}
    )
    primary = next((g for g in goals if g.is_primary), None)

    return {
        "user_id": str(user_id),
        "goals": [
            {
                "career_id":   str(g.career_id),
                "career_name": titles.get(g.career_id),
                "progress":    g.progress,
                "is_primary":  g.is_primary,
                "notes":       g.notes,
                "created_at":  g.created_at.isoformat() if g.created_at else None,
            }
            for g in goals
        ],
        "assessments": [
            {
                "career_id":    str(a.career_id),
                "career_name":  titles.get(a.career_id),
                "ready_score":  a.ready_score,
                "skill_scores": a.skill_scores,
                "gaps":         a.gaps,
                "assessed_at":  a.assessed_at.isoformat() if a.assessed_at else None,
            }
            for a in assessments
        ],
        "primary_career": titles.get(primary.career_id) if primary else None,
    }
