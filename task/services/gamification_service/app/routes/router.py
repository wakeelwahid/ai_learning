from fastapi import APIRouter

from app.routes.activity_feed import router as activity_feed_router
from app.routes.badges import router as badges_router
from app.routes.challenge_programs import router as challenge_programs_router
from app.routes.challenges import router as challenges_router
from app.routes.daily_rewards import router as daily_rewards_router
from app.routes.edupoints import router as edupoints_router
from app.routes.engagement_config import router as engagement_config_router
from app.routes.feature_usage import router as feature_usage_router
from app.routes.goals import router as goals_router
from app.routes.internal_xp import router as internal_xp_router
from app.routes.leaderboard import router as leaderboard_router
from app.routes.profile import router as profile_router
from app.routes.season import router as season_router
from app.routes.share import router as share_router
from app.routes.streak_freeze import router as streak_freeze_router
from app.routes.streaks import router as streaks_router
from app.routes.xp_level import router as xp_level_router
from app.routes.youtube_claims import router as youtube_claims_router

api_router = APIRouter()
api_router.include_router(xp_level_router)
api_router.include_router(streaks_router)
api_router.include_router(profile_router)
api_router.include_router(edupoints_router)
api_router.include_router(challenges_router)
api_router.include_router(challenge_programs_router)
api_router.include_router(leaderboard_router)
api_router.include_router(badges_router)
api_router.include_router(streak_freeze_router)
api_router.include_router(feature_usage_router)
api_router.include_router(season_router)
api_router.include_router(share_router)
api_router.include_router(youtube_claims_router)
api_router.include_router(internal_xp_router)
api_router.include_router(activity_feed_router)
api_router.include_router(daily_rewards_router)
api_router.include_router(goals_router)
api_router.include_router(engagement_config_router)
