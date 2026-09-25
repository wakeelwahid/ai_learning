"""Career dashboard — aggregates goals, latest assessment and recommendations."""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.career_catalog_service import CareerCatalogService
from app.services.career_goal_service import CareerGoalService
from app.services.skill_gap_service import SkillGapService

logger = logging.getLogger(__name__)


class CareerDashboardService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_dashboard(self, user_id: uuid.UUID) -> dict:
        goals = await CareerGoalService(self.db).get_goals(user_id)
        primary = next((g for g in goals if g["is_primary"]), None)
        primary_assessment = None
        if primary:
            primary_assessment = await SkillGapService(self.db).get_latest_assessment(
                user_id, uuid.UUID(primary["career_id"])
            )

        # Recommend careers based on category diversity
        all_careers = await CareerCatalogService(self.db).list_careers(limit=6)
        recommended = [
            {
                "id": str(c.id), "title": c.title, "category": c.category,
                "slug": c.slug, "demand_level": c.demand_level,
                "overview": c.overview[:100] + "...",
                "icon": c.icon, "color": c.color, "salary_range": c.salary_range,
            }
            for c in all_careers
        ]

        goal_career_ids = {g["career_id"] for g in goals}
        recommended = [r for r in recommended if r["id"] not in goal_career_ids][:4]

        return {
            "primary_goal":        primary,
            "all_goals":           goals,
            "latest_assessment":   primary_assessment,
            "recommended_careers": recommended,
            "xp_from_career":      len(goals) * 50,
        }
