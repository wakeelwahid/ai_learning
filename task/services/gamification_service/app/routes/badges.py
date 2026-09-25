import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import verify_owner_or_admin
from app.crud.gamification_crud import get_user_badges
from app.database.session import get_db
from app.models.gamification import BadgeType

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Badge endpoints ───────────────────────────────────────────────────────────

BADGE_META: dict[str, dict] = {
    "first_video":        {"name": "First Video",         "description": "Watch your first video",                  "xp_required": 0},
    "quiz_ace":           {"name": "Quiz Ace",            "description": "Score 100% on a quiz",                    "xp_required": 0},
    "streak_7":           {"name": "Week Warrior",        "description": "Maintain a 7-day streak",                 "xp_required": 0},
    "streak_30":          {"name": "Monthly Master",      "description": "Maintain a 30-day streak",                "xp_required": 0},
    "chapter_complete":   {"name": "Chapter Complete",    "description": "Complete an entire chapter",              "xp_required": 0},
    "subject_complete":   {"name": "Subject Complete",    "description": "Complete an entire subject",              "xp_required": 300},
    "referral_champion":  {"name": "Referral Champion",   "description": "Successfully refer 5 friends",           "xp_required": 0},
    "premium_member":     {"name": "Premium Member",      "description": "Become a premium member",                 "xp_required": 0},
    "battle_champion":    {"name": "Battle Champion",     "description": "Win 10 battles",                          "xp_required": 700},
    "quiz_warrior":       {"name": "Quiz Warrior",        "description": "Complete 50 quizzes",                     "xp_required": 300},
    "top_performer":      {"name": "Top Performer",       "description": "Reach the top 10 on the leaderboard",    "xp_required": 1_200},
    "win_streak_5":       {"name": "Win Streak",          "description": "Win 5 battles in a row",                  "xp_required": 700},
    "level_5":            {"name": "Level 5 Achiever",    "description": "Reach level 5",                           "xp_required": 2_000},
    "level_10":           {"name": "Level 10 Elite",      "description": "Reach level 10",                          "xp_required": 8_000},
    "elite_learner":      {"name": "Elite Learner",       "description": "Unlock all level 10 features",           "xp_required": 8_000},
}


@router.get("/badges")
async def get_all_badges():
    """Return list of all badge types with name, description, and XP requirements."""
    badges = []
    for badge in BadgeType:
        meta = BADGE_META.get(badge.value, {"name": badge.value, "description": "", "xp_required": 0})
        badges.append({
            "type": badge.value,
            "name": meta["name"],
            "description": meta["description"],
            "xp_required": meta["xp_required"],
        })
    return badges


@router.get("/badges/{user_id}", dependencies=[Depends(verify_owner_or_admin)])
async def get_user_badges_endpoint(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return list of badges earned by a specific user."""
    badges = await get_user_badges(db, user_id)
    return [
        {
            "type": b.badge_type.value,
            "name": BADGE_META.get(b.badge_type.value, {}).get("name", b.badge_type.value),
            "earned_at": b.earned_at.isoformat(),
        }
        for b in badges
    ]
