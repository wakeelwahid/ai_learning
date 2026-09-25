"""Schemas for the career dashboard aggregate view."""


from pydantic import BaseModel

from app.schemas.career_catalog import CareerListItem
from app.schemas.career_goal import CareerGoalOut
from app.schemas.skill_gap import SkillGapOut


class CareerDashboardOut(BaseModel):
    primary_goal:     CareerGoalOut | None
    all_goals:        list[CareerGoalOut]
    latest_assessment: SkillGapOut | None
    recommended_careers: list[CareerListItem]
    xp_from_career:   int
