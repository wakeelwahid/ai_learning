import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin, require_internal, verify_owner_or_admin
from app.crud.gamification_crud import (
    commit_goal_template,
    create_goal_template as crud_create_goal_template,
    deactivate_goal_template as crud_deactivate_goal_template,
    get_goal_completion_analytics,
    get_goal_template,
    list_goal_templates as crud_list_goal_templates,
    update_goal_template as crud_update_goal_template,
)
from app.database.session import get_db
from app.schemas.gamification import (
    GoalTemplateCreateRequest,
    GoalTemplateResponse,
    GoalTemplateUpdateRequest,
    RecordGoalProgressRequest,
    UserDailyGoalResponse,
)
from app.services.gamification_service import GoalService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Daily Goal System ─────────────────────────────────────────────────────────

@router.get("/goals/today/{user_id}", response_model=list[UserDailyGoalResponse], dependencies=[Depends(verify_owner_or_admin)])
async def get_today_goal(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Today's personalized goal SET for this user (up to 4 — one per slot:
    video/quiz/ai_doubt/streak) — created on first read if the morning job
    hasn't run yet for them (new signup, missed cron tick, etc.). Returns []
    if the daily-goal feature is disabled or no templates exist for any slot.

    v1 returned a single object (one random goal/day); this is now a list
    to support the v2 "goals/day" design — MissionCard.tsx and
    GrowthDashboard.tsx were updated alongside this change."""
    goals = await GoalService(db).get_or_create_today(user_id)
    await db.commit()
    return [UserDailyGoalResponse.model_validate(g) for g in goals]


@router.get("/goals/internal/today/{user_id}", response_model=list[UserDailyGoalResponse], dependencies=[Depends(require_internal)])
async def get_today_goal_internal(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """[Internal] Same as /goals/today/{user_id} but network-gated instead of
    JWT-gated — used by notification_service's scheduler, which has no
    end-user bearer token to forward when composing the morning/evening
    reminder for a given user."""
    goals = await GoalService(db).get_or_create_today(user_id)
    await db.commit()
    return [UserDailyGoalResponse.model_validate(g) for g in goals]


@router.post("/goals/progress", status_code=202, dependencies=[Depends(require_internal)])
async def record_goal_progress(body: RecordGoalProgressRequest, db: AsyncSession = Depends(get_db)):
    """[Internal] Called by quiz_service (and, once wired, content_service)
    on a qualifying completion event — increments today's goal progress,
    auto-completes and auto-rewards when the target is reached."""
    result = await GoalService(db).record_progress(body.user_id, body.goal_type, body.increment)
    await db.commit()
    return result or {"recorded": False}


@router.get("/goals/admin/templates", response_model=list[GoalTemplateResponse], dependencies=[Depends(require_admin)])
async def list_goal_templates(db: AsyncSession = Depends(get_db)):
    """[Admin] All goal templates, including inactive."""
    rows = await crud_list_goal_templates(db)
    return [GoalTemplateResponse.model_validate(t) for t in rows]


@router.post("/goals/admin/templates", response_model=GoalTemplateResponse, dependencies=[Depends(require_admin)])
async def create_goal_template(body: GoalTemplateCreateRequest, db: AsyncSession = Depends(get_db)):
    """[Admin] Create a reusable goal template — immediately live for the
    next morning's auto-generation, no deploy required."""
    template = await crud_create_goal_template(db, body.model_dump())
    response = GoalTemplateResponse.model_validate(template)
    await commit_goal_template(db)
    return response


@router.patch("/goals/admin/templates/{template_id}", response_model=GoalTemplateResponse, dependencies=[Depends(require_admin)])
async def update_goal_template(template_id: uuid.UUID, body: GoalTemplateUpdateRequest, db: AsyncSession = Depends(get_db)):
    """[Admin] Edit a goal template (e.g. toggle active, tune reward/difficulty)."""
    template = await get_goal_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Goal template not found")
    template = await crud_update_goal_template(db, template, body.model_dump(exclude_unset=True))
    return GoalTemplateResponse.model_validate(template)


@router.delete("/goals/admin/templates/{template_id}", dependencies=[Depends(require_admin)])
async def deactivate_goal_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """[Admin] Deactivate a template — existing UserDailyGoal snapshots
    already assigned from it are unaffected (title/rewards were captured at
    assignment time)."""
    template = await get_goal_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Goal template not found")
    await crud_deactivate_goal_template(db, template)
    return {"id": str(template_id), "deactivated": True}


@router.post("/goals/admin/generate-today", dependencies=[Depends(require_internal)])
async def generate_today_goals(db: AsyncSession = Depends(get_db)):
    """[Internal] Morning-job entry point — called by notification_service's
    scheduler. Assigns today's goal to every active user. Idempotent."""
    count = await GoalService(db).generate_for_active_users()
    return {"generated": count}


@router.get("/goals/admin/analytics", dependencies=[Depends(require_admin)])
async def goal_completion_analytics(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Daily goal completion stats for the last N days."""
    rows = await get_goal_completion_analytics(db, days)
    return [
        {
            "date": str(r["goal_date"]), "assigned": r["assigned"], "completed": r["completed"],
            "completion_rate": round(r["completed"] / r["assigned"] * 100, 1) if r["assigned"] else 0.0,
        }
        for r in rows
    ]
