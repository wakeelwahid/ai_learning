import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id, require_admin, require_internal, verify_owner_or_admin
from app.crud.gamification_crud import delete_activity_feed_item, get_activity_feed_item, list_activity_feed_admin
from app.database.session import get_db
from app.models.gamification import ActivityType
from app.schemas.gamification import ActivityFeedEntry, RecordActivityFeedRequest
from app.services.gamification_service import ActivityFeedService

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Friend Activity Feed ──────────────────────────────────────────────────────
# "Rahul completed Biology Quiz", "Anjali reached Level 12", "Mohit got 95%",
# "Priya won Battle" — a lightweight friend-facing feed of quiz/battle/level/
# badge events. Level-up and badge-earned entries are recorded automatically
# (see GamificationService._apply_xp_amount / _award_badge); quiz completions
# and battle wins are recorded by quiz_service / battle_service calling the
# internal endpoint below.

@router.post("/activity/record", status_code=201, dependencies=[Depends(require_internal)])
async def record_activity_feed_event(
    body: RecordActivityFeedRequest,
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Record a friend-activity-feed event. Called service-to-service
    by quiz_service (quiz completion) and battle_service (battle win) — no
    end-user JWT is available at that call site, so this is gated by Docker
    network isolation only (require_internal), matching payment_service's
    /subscription/status/{user_id} convention."""
    await ActivityFeedService(db).record(
        user_id=body.user_id,
        activity_type=body.activity_type,
        title=body.title,
        subject=body.subject,
        score_pct=body.score_pct,
        xp_earned=body.xp_earned,
    )
    await db.commit()
    return {"recorded": True}


@router.get("/activity/mine/{user_id}", response_model=list[ActivityFeedEntry], dependencies=[Depends(verify_owner_or_admin)])
async def get_my_activity(
    user_id: uuid.UUID,
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """A user's own activity log."""
    rows = await ActivityFeedService(db).get_mine(user_id, limit)
    return [ActivityFeedEntry.model_validate(r) for r in rows]


async def get_friends_activity_feed(db: AsyncSession, user_id: uuid.UUID, limit: int) -> list[ActivityFeedEntry]:
    """Recent activity from this user's friends (resolved via user_service).
    Fails open to an empty list (not an error) if user_service is briefly
    unreachable — a missing feed is a much better failure mode than a 5xx on
    someone's dashboard/notification job."""
    friend_ids: list[uuid.UUID] = []
    friend_names: dict[str, str] = {}
    friend_avatars: dict[str, str] = {}
    try:
        async with httpx.AsyncClient(timeout=settings.USER_SERVICE_TIMEOUT_SECONDS) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/friends",
                params={"user_id": str(user_id)},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code == 200:
            for f in resp.json():
                friend_ids.append(uuid.UUID(f["user_id"]))
                if f.get("full_name"):
                    friend_names[f["user_id"]] = f["full_name"]
                if f.get("avatar_url"):
                    friend_avatars[f["user_id"]] = f["avatar_url"]
    except Exception:
        pass

    if not friend_ids:
        return []

    rows = await ActivityFeedService(db).get_for_users(friend_ids, limit)
    out = []
    for r in rows:
        entry = ActivityFeedEntry.model_validate(r)
        entry.user_name = friend_names.get(str(r.user_id))
        entry.user_avatar = friend_avatars.get(str(r.user_id))
        out.append(entry)
    return out


@router.get("/activity/friends/{user_id}", response_model=list[ActivityFeedEntry], dependencies=[Depends(verify_owner_or_admin)])
async def get_friends_activity(
    user_id: uuid.UUID,
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await get_friends_activity_feed(db, user_id, limit)


@router.get("/activity/internal/friends/{user_id}", response_model=list[ActivityFeedEntry], dependencies=[Depends(require_internal)])
async def get_friends_activity_internal(
    user_id: uuid.UUID,
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """[Internal] Same as /activity/friends/{user_id} but network-gated —
    used by notification_service's afternoon Friend Activity job."""
    return await get_friends_activity_feed(db, user_id, limit)


@router.get("/activity/friend/{friend_id}", response_model=list[ActivityFeedEntry])
async def get_one_friends_activity(
    friend_id: uuid.UUID,
    limit: int = Query(30, ge=1, le=100),
    caller_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """One specific friend's activity timeline — powers the "tap a friend's
    name in Messages" view. Access requires an ACCEPTED friendship between the
    caller and {friend_id} (verified via user_service), so a user can never
    browse a stranger's activity by guessing IDs."""
    friend_name: str | None = None
    friend_avatar: str | None = None
    is_friend = False
    try:
        async with httpx.AsyncClient(timeout=settings.USER_SERVICE_TIMEOUT_SECONDS) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/friends",
                params={"user_id": str(caller_id)},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code == 200:
            for f in resp.json():
                if f["user_id"] == str(friend_id):
                    is_friend = True
                    friend_name = f.get("full_name")
                    friend_avatar = f.get("avatar_url")
                    break
    except Exception:
        raise HTTPException(status_code=503, detail="Friend list temporarily unavailable")

    if not is_friend and caller_id != friend_id:
        raise HTTPException(status_code=403, detail="You can only view activity of your friends.")

    rows = await ActivityFeedService(db).get_mine(friend_id, limit)
    out = []
    for r in rows:
        entry = ActivityFeedEntry.model_validate(r)
        entry.user_name = friend_name
        entry.user_avatar = friend_avatar
        out.append(entry)
    return out


@router.get("/activity/admin/recent", response_model=list[ActivityFeedEntry], dependencies=[Depends(require_admin)])
async def admin_list_recent_activity(
    limit: int = Query(50, ge=1, le=200),
    activity_type: ActivityType | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Recent activity-feed events across ALL users — the moderation
    log. Optionally filtered by activity_type."""
    rows = await list_activity_feed_admin(db, limit, activity_type)
    return [ActivityFeedEntry.model_validate(r) for r in rows]


@router.delete("/activity/admin/{item_id}", dependencies=[Depends(require_admin)])
async def admin_delete_activity(item_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """[Admin] Remove an activity-feed event (moderation — e.g. an offensive
    quiz title surfaced into friends' feeds)."""
    row = await get_activity_feed_item(db, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Activity item not found")
    await delete_activity_feed_item(db, row)
    return {"deleted": True}
