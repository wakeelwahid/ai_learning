from fastapi import Request, Response, APIRouter

from app.core.rest_router import rest_router
from app.services import gamification_svc

router = APIRouter(prefix="/api/v1/gamification", tags=["Gamification"])


# ── XP / Level ────────────────────────────────────────────────────────────────

@rest_router(router.post, path="/xp/award", proxy=gamification_svc,
    summary="Award XP for an event (background)")
async def award_xp(request: Request, response: Response):
    pass

@rest_router(router.post, path="/xp/event", proxy=gamification_svc,
    summary="Internal — record an XP-earning event")
async def xp_event(request: Request, response: Response):
    pass

@rest_router(router.get, path="/level/{user_id}", proxy=gamification_svc,
    summary="Detailed level info, unlocks, progress %")
async def level_info(request: Request, response: Response, user_id: str):
    pass


# ── Streaks ───────────────────────────────────────────────────────────────────

@rest_router(router.post, path="/streak/record", proxy=gamification_svc,
    summary="Record daily activity for streak")
async def record_activity(request: Request, response: Response):
    pass

@rest_router(router.get, path="/streak/{user_id}", proxy=gamification_svc,
    summary="Current and longest streak")
async def streak(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/streaks/{user_id}", proxy=gamification_svc,
    summary="Current and longest streak (alias)")
async def streaks(request: Request, response: Response, user_id: str):
    pass


# ── Streak Freeze ───────────────────────────────────────────────────────────────

@rest_router(router.post, path="/streaks/freeze/purchase", proxy=gamification_svc,
    summary="Buy a Streak Freeze shield with EduPoints")
async def streak_freeze_purchase(request: Request, response: Response):
    pass

@rest_router(router.get, path="/streaks/freeze/status/{user_id}", proxy=gamification_svc,
    summary="Streak Freeze count, cost and purchase eligibility")
async def streak_freeze_status(request: Request, response: Response, user_id: str):
    pass


# ── EduPoints ─────────────────────────────────────────────────────────────────

@rest_router(router.post, path="/edupoints/award", proxy=gamification_svc,
    summary="Award EduPoints for an earning event")
async def award_ep(request: Request, response: Response):
    pass

@rest_router(router.post, path="/edupoints/spend", proxy=gamification_svc,
    summary="Spend EduPoints to unlock an item")
async def spend_ep(request: Request, response: Response):
    pass

@rest_router(router.get, path="/edupoints/balance/{user_id}", proxy=gamification_svc,
    summary="EduPoints balance for a user")
async def ep_balance(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/edupoints/history/{user_id}", proxy=gamification_svc,
    summary="EduPoints transaction history")
async def ep_history(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/edupoints/shop/{user_id}", proxy=gamification_svc,
    summary="Shop items with ownership status")
async def ep_shop(request: Request, response: Response, user_id: str):
    pass


# ── Daily Challenges ──────────────────────────────────────────────────────────

@rest_router(router.get, path="/challenges/today", proxy=gamification_svc,
    summary="Today's challenge (no user)")
async def challenge_today(request: Request, response: Response):
    pass

@rest_router(router.get, path="/challenges/today/{user_id}", proxy=gamification_svc,
    summary="Today's challenge with user progress")
async def challenge_today_user(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.post, path="/challenges/progress", proxy=gamification_svc,
    summary="Record progress toward a challenge")
async def challenge_progress(request: Request, response: Response):
    pass

@rest_router(router.post, path="/challenges/claim", proxy=gamification_svc,
    summary="Claim reward for completed challenge")
async def challenge_claim(request: Request, response: Response):
    pass

@rest_router(router.post, path="/challenges/admin/create", proxy=gamification_svc,
    summary="Admin: publish a daily challenge")
async def challenge_create(request: Request, response: Response):
    pass

@rest_router(router.get, path="/challenges/weekly/{user_id}", proxy=gamification_svc,
    summary="Weekly challenge stats")
async def challenge_weekly(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/challenges/monthly/{user_id}", proxy=gamification_svc,
    summary="Monthly challenge stats")
async def challenge_monthly(request: Request, response: Response, user_id: str):
    pass


# ── Profile / Leaderboard ─────────────────────────────────────────────────────

@rest_router(router.get, path="/profile/{user_id}", proxy=gamification_svc,
    summary="Full gamification profile (XP, EP, streak, badges)")
async def profile(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/leaderboard", proxy=gamification_svc,
    summary="Global XP leaderboard")
async def leaderboard(request: Request, response: Response):
    pass

@rest_router(router.get, path="/leaderboard/rank-rewards", proxy=gamification_svc,
    summary="Season rank reward tiers")
async def rank_rewards(request: Request, response: Response):
    pass

@rest_router(router.get, path="/leaderboard/friends/{user_id}", proxy=gamification_svc,
    summary="Friends-only XP leaderboard (Growth Dashboard)")
async def leaderboard_friends(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/rank-unlock/{user_id}", proxy=gamification_svc,
    summary="User's current rank and unlock status")
async def rank_unlock(request: Request, response: Response, user_id: str):
    pass


# ── Badges ────────────────────────────────────────────────────────────────────

@rest_router(router.get, path="/badges", proxy=gamification_svc,
    summary="All available badges")
async def badges(request: Request, response: Response):
    pass

@rest_router(router.get, path="/badges/{user_id}", proxy=gamification_svc,
    summary="Badges earned by a user")
async def badges_user(request: Request, response: Response, user_id: str):
    pass


# ── Season ────────────────────────────────────────────────────────────────────

@rest_router(router.get, path="/season/current", proxy=gamification_svc,
    summary="Current season details")
async def season_current(request: Request, response: Response):
    pass


# ── Share Card ────────────────────────────────────────────────────────────────

@rest_router(router.get, path="/share-card/{user_id}/{achievement_type}", proxy=gamification_svc,
    summary="Share card metadata for an achievement")
async def share_card(request: Request, response: Response, user_id: str, achievement_type: str):
    pass

@rest_router(router.post, path="/share-event", proxy=gamification_svc,
    summary="Record a share event when a user shares an achievement card")
async def share_event(request: Request, response: Response):
    pass


# ── YouTube Subscribe Claims ───────────────────────────────────────────────────

@rest_router(router.post, path="/youtube-subscribe/claim", proxy=gamification_svc, status_code=201,
    summary="Submit YouTube subscribe screenshot claim")
async def yt_submit(request: Request, response: Response):
    pass

@rest_router(router.get, path="/youtube-subscribe/claim/{user_id}", proxy=gamification_svc,
    summary="Get claim status for a user")
async def yt_status(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/youtube-subscribe/claims", proxy=gamification_svc,
    summary="[Admin] List all YouTube subscribe claims")
async def yt_list(request: Request, response: Response):
    pass

@rest_router(router.post, path="/youtube-subscribe/claims/{claim_id}/approve", proxy=gamification_svc,
    summary="[Admin] Approve claim → award 500 EP")
async def yt_approve(request: Request, response: Response, claim_id: str):
    pass

@rest_router(router.post, path="/youtube-subscribe/claims/{claim_id}/reject", proxy=gamification_svc,
    summary="[Admin] Reject claim")
async def yt_reject(request: Request, response: Response, claim_id: str):
    pass


# ── Friend Activity Feed ──────────────────────────────────────────────────────

# NOTE: POST /activity/record is intentionally NOT proxied here — the backend
# route is require_internal-only (quiz_service and battle_service call it
# directly on the internal Docker network, with no end-user JWT in context).
# A gateway stub would let an unauthenticated external caller inject forged
# entries into any user's friend activity feed, since require_internal only
# checks the CALLER's IP — and the gateway's own container IP is on the
# private network and would satisfy that check.

@rest_router(router.get, path="/activity/mine/{user_id}", proxy=gamification_svc,
    summary="A user's own activity log")
async def activity_mine(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/activity/friends/{user_id}", proxy=gamification_svc,
    summary="Recent activity from this user's friends")
async def activity_friends(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/activity/friend/{friend_id}", proxy=gamification_svc,
    summary="One specific friend's activity timeline (friendship-gated)")
async def activity_one_friend(request: Request, response: Response, friend_id: str):
    pass

@rest_router(router.get, path="/activity/admin/recent", proxy=gamification_svc,
    summary="[Admin] Recent activity events across all users (moderation log)")
async def activity_admin_recent(request: Request, response: Response):
    pass

@rest_router(router.delete, path="/activity/admin/{item_id}", proxy=gamification_svc,
    summary="[Admin] Remove an activity-feed event (moderation)")
async def activity_admin_delete(request: Request, response: Response, item_id: str):
    pass


# ── Daily Rewards (Day 1-7 check-in calendar) ──────────────────────────────────

@rest_router(router.get, path="/daily-reward/status/{user_id}", proxy=gamification_svc,
    summary="Current day-in-cycle, claimed-today, reward calendar")
async def daily_reward_status(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.post, path="/daily-reward/claim/{user_id}", proxy=gamification_svc,
    summary="Claim today's check-in reward")
async def daily_reward_claim(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/admin/reward-calendar", proxy=gamification_svc,
    summary="[Admin] Full Day 1-7 reward calendar")
async def admin_reward_calendar_list(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/admin/reward-calendar/{day}", proxy=gamification_svc,
    summary="[Admin] Edit one Day 1-7 reward slot")
async def admin_reward_calendar_update(request: Request, response: Response, day: str):
    pass


# ── Daily Goal System ─────────────────────────────────────────────────────────

@rest_router(router.get, path="/goals/today/{user_id}", proxy=gamification_svc,
    summary="Today's personalized goal for this user")
async def goals_today(request: Request, response: Response, user_id: str):
    pass

# NOTE: POST /goals/progress is intentionally NOT proxied here — the backend
# route is require_internal-only (quiz_service and content_service call it
# directly on the internal Docker network, with no end-user JWT in context).
# A gateway stub would let an unauthenticated external caller forge daily-goal
# progress/auto-completion/auto-reward for any user_id, since require_internal
# only checks the CALLER's IP — and the gateway's own container IP is on the
# private network and would satisfy that check.

@rest_router(router.get, path="/goals/admin/templates", proxy=gamification_svc,
    summary="[Admin] List all goal templates")
async def goals_templates_list(request: Request, response: Response):
    pass

@rest_router(router.post, path="/goals/admin/templates", proxy=gamification_svc,
    summary="[Admin] Create a goal template")
async def goals_templates_create(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/goals/admin/templates/{template_id}", proxy=gamification_svc,
    summary="[Admin] Edit a goal template")
async def goals_templates_update(request: Request, response: Response, template_id: str):
    pass

@rest_router(router.delete, path="/goals/admin/templates/{template_id}", proxy=gamification_svc,
    summary="[Admin] Deactivate a goal template")
async def goals_templates_delete(request: Request, response: Response, template_id: str):
    pass

@rest_router(router.get, path="/goals/admin/analytics", proxy=gamification_svc,
    summary="[Admin] Daily goal completion stats")
async def goals_analytics(request: Request, response: Response):
    pass


# ── Challenge Programs (multi-day, mixed-task-type) ──────────────────────────
# Path segment /challenge-programs/... deliberately distinct from the
# /challenges/... namespace above (unrelated DailyChallenge feature).
# POST /challenge-programs/internal/task-progress is intentionally NOT
# proxied here — same require_internal rationale as every other NOTE in
# this file: content_service/quiz_service/battle_service/analytics_service
# call it directly on the internal Docker network with no end-user JWT: a
# gateway stub would let an external caller forge task-completion triggers.

@rest_router(router.post, path="/challenge-programs/admin", proxy=gamification_svc, status_code=201,
    summary="[Admin] Create a new Challenge Program")
async def challenge_program_create(request: Request, response: Response):
    pass

@rest_router(router.get, path="/challenge-programs/admin", proxy=gamification_svc,
    summary="[Admin] List all Challenge Programs (any status)")
async def challenge_program_admin_list(request: Request, response: Response):
    pass

@rest_router(router.get, path="/challenge-programs/admin/{program_id}", proxy=gamification_svc,
    summary="[Admin] Full Challenge Program detail, including drafts")
async def challenge_program_admin_get(request: Request, response: Response, program_id: str):
    pass

@rest_router(router.patch, path="/challenge-programs/admin/{program_id}", proxy=gamification_svc,
    summary="[Admin] Edit Challenge Program metadata")
async def challenge_program_admin_update(request: Request, response: Response, program_id: str):
    pass

@rest_router(router.post, path="/challenge-programs/admin/{program_id}/days", proxy=gamification_svc, status_code=201,
    summary="[Admin] Add a day to a Challenge Program")
async def challenge_program_add_day(request: Request, response: Response, program_id: str):
    pass

@rest_router(router.delete, path="/challenge-programs/admin/days/{day_id}", proxy=gamification_svc,
    summary="[Admin] Delete a Challenge Program day (and its tasks)")
async def challenge_program_delete_day(request: Request, response: Response, day_id: str):
    pass

@rest_router(router.post, path="/challenge-programs/admin/days/{day_id}/tasks", proxy=gamification_svc, status_code=201,
    summary="[Admin] Add a task to a Challenge Program day")
async def challenge_program_add_task(request: Request, response: Response, day_id: str):
    pass

@rest_router(router.patch, path="/challenge-programs/admin/tasks/{task_id}", proxy=gamification_svc,
    summary="[Admin] Edit a Challenge Program task")
async def challenge_program_update_task(request: Request, response: Response, task_id: str):
    pass

@rest_router(router.delete, path="/challenge-programs/admin/tasks/{task_id}", proxy=gamification_svc,
    summary="[Admin] Delete a Challenge Program task")
async def challenge_program_delete_task(request: Request, response: Response, task_id: str):
    pass

@rest_router(router.post, path="/challenge-programs/admin/{program_id}/publish", proxy=gamification_svc,
    summary="[Admin] Publish a Challenge Program")
async def challenge_program_publish(request: Request, response: Response, program_id: str):
    pass

@rest_router(router.post, path="/challenge-programs/admin/{program_id}/unpublish", proxy=gamification_svc,
    summary="[Admin] Unpublish a Challenge Program back to draft")
async def challenge_program_unpublish(request: Request, response: Response, program_id: str):
    pass

@rest_router(router.post, path="/challenge-programs/admin/{program_id}/archive", proxy=gamification_svc,
    summary="[Admin] Archive a Challenge Program")
async def challenge_program_archive(request: Request, response: Response, program_id: str):
    pass

@rest_router(router.delete, path="/challenge-programs/admin/{program_id}", proxy=gamification_svc,
    summary="[Admin] Delete a draft Challenge Program")
async def challenge_program_delete(request: Request, response: Response, program_id: str):
    pass

@rest_router(router.get, path="/challenge-programs/admin/{program_id}/analytics", proxy=gamification_svc,
    summary="[Admin] Participant/completion analytics for a Challenge Program")
async def challenge_program_analytics(request: Request, response: Response, program_id: str):
    pass

@rest_router(router.get, path="/challenge-programs/published", proxy=gamification_svc,
    summary="Browse published Challenge Programs")
async def challenge_program_list_published(request: Request, response: Response):
    pass

@rest_router(router.get, path="/challenge-programs/enrollments/{user_id}", proxy=gamification_svc,
    summary="This user's Challenge Program enrollments")
async def challenge_program_my_enrollments(request: Request, response: Response, user_id: str):
    pass

@rest_router(router.get, path="/challenge-programs/enrollments/{user_id}/{program_id}", proxy=gamification_svc,
    summary="This user's day-by-day progress in one Challenge Program")
async def challenge_program_enrollment_progress(request: Request, response: Response, user_id: str, program_id: str):
    pass

@rest_router(router.get, path="/challenge-programs/{program_id}", proxy=gamification_svc,
    summary="One published Challenge Program's full detail")
async def challenge_program_get(request: Request, response: Response, program_id: str):
    pass

@rest_router(router.post, path="/challenge-programs/{program_id}/join", proxy=gamification_svc, status_code=201,
    summary="Join a published Challenge Program")
async def challenge_program_join(request: Request, response: Response, program_id: str):
    pass


# ── Engagement Config (dynamic, no-deploy admin settings) ─────────────────────

@rest_router(router.get, path="/admin/engagement-config", proxy=gamification_svc,
    summary="[Admin] All dynamic engagement toggles")
async def engagement_config_list(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/admin/engagement-config/{key}", proxy=gamification_svc,
    summary="[Admin] Set one engagement config key")
async def engagement_config_set(request: Request, response: Response, key: str):
    pass


# ── Feature Usage Limits (admin-configurable, cross-service quotas) ──────────

@rest_router(router.get, path="/admin/feature-limits", proxy=gamification_svc,
    summary="[Admin] Every feature's current daily limit (free/premium)")
async def feature_limits_list(request: Request, response: Response):
    pass

@rest_router(router.patch, path="/admin/feature-limits/{feature_key}", proxy=gamification_svc,
    summary="[Admin] Set one feature's daily limits")
async def feature_limits_set(request: Request, response: Response, feature_key: str):
    pass

@rest_router(router.get, path="/usage/status/{user_id}", proxy=gamification_svc,
    summary="Today's usage/limit for every feature (read-only)")
async def usage_status(request: Request, response: Response, user_id: str):
    pass

# NOTE: POST /internal/usage/check-and-log is intentionally NOT proxied here —
# it's require_internal-only (every gated service calls it directly on the
# internal Docker network before performing a quota-limited action), not
# require_admin or user-facing. A gateway stub would let ANY unauthenticated
# external caller log arbitrary usage against arbitrary user_ids, since
# require_internal only checks the CALLER's IP — and the gateway's own
# container IP is on the private network and would satisfy that check
# (same reasoning as goals/admin/generate-today below).

# NOTE: POST /goals/admin/generate-today is intentionally NOT proxied here —
# despite the "admin" path segment, the backend route is require_internal-only
# (notification_service's morning scheduler calls it directly on the internal
# Docker network), not require_admin. A gateway stub would let ANY
# unauthenticated external caller trigger the platform-wide daily-goal
# generation batch job on demand, since require_internal only checks the
# CALLER's IP — and the gateway's own container IP is on the private network
# and would satisfy that check.
