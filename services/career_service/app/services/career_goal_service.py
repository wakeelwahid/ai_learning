"""Career goals — set, list and delete a user's career goals."""
import logging
import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.career_catalog import Career
from app.models.career_goal import CareerGoal
from app.services import gamification_client

logger = logging.getLogger(__name__)


class CareerGoalService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def set_goal(
        self,
        user_id: uuid.UUID,
        career_id: uuid.UUID,
        is_primary: bool = False,
        notes: str | None = None,
        bearer_token: str | None = None,
    ) -> CareerGoal:
        existing = await self.db.execute(
            select(CareerGoal).where(
                CareerGoal.user_id == user_id,
                CareerGoal.career_id == career_id,
            )
        )
        goal = existing.scalar_one_or_none()
        is_new = goal is None

        # At most one goal can be primary per user — unset any other goal
        # currently marked primary before setting this one (applies whether
        # we're updating an existing goal or creating a new one).
        if is_primary:
            await self.db.execute(
                update(CareerGoal)
                .where(
                    CareerGoal.user_id == user_id,
                    CareerGoal.career_id != career_id,
                    CareerGoal.is_primary == True,
                )
                .values(is_primary=False)
            )

        if goal:
            goal.is_primary = is_primary
            goal.notes = notes
        else:
            goal = CareerGoal(
                user_id=user_id,
                career_id=career_id,
                is_primary=is_primary,
                notes=notes,
            )
            self.db.add(goal)
        await self.db.commit()
        await self.db.refresh(goal)

        # XP is awarded only on the genuine first-time creation of a goal for
        # this (user, career) pair — never on updates (e.g. toggling
        # is_primary or editing notes), so a user can't farm XP by repeatedly
        # re-submitting the same goal.
        if is_new and bearer_token:
            await gamification_client.award_xp(user_id, "career_goal_set", bearer_token, str(goal.id))

        return goal

    async def get_goals(self, user_id: uuid.UUID) -> list[dict]:
        res = await self.db.execute(
            select(CareerGoal, Career)
            .join(Career, Career.id == CareerGoal.career_id)
            .where(CareerGoal.user_id == user_id)
            .order_by(CareerGoal.is_primary.desc(), CareerGoal.created_at.desc())
        )
        rows = res.all()
        return [
            {
                "id":         str(goal.id),
                "user_id":    str(goal.user_id),
                "career_id":  str(goal.career_id),
                "progress":   goal.progress,
                "is_primary": goal.is_primary,
                "notes":      goal.notes,
                "created_at": goal.created_at.isoformat(),
                "career": {
                    "id":           str(career.id),
                    "title":        career.title,
                    "category":     career.category,
                    "slug":         career.slug,
                    "overview":     career.overview[:150] + "..." if len(career.overview) > 150 else career.overview,
                    "demand_level": career.demand_level,
                    "icon":         career.icon,
                    "color":        career.color,
                    "salary_range": career.salary_range,
                },
            }
            for goal, career in rows
        ]

    async def delete_goal(self, user_id: uuid.UUID, career_id: uuid.UUID) -> bool:
        res = await self.db.execute(
            select(CareerGoal).where(
                CareerGoal.user_id == user_id,
                CareerGoal.career_id == career_id,
            )
        )
        goal = res.scalar_one_or_none()
        if not goal:
            return False
        await self.db.delete(goal)
        await self.db.commit()
        return True
