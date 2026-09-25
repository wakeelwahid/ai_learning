import json
import uuid

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id, get_redis, verify_owner_or_admin
from app.crud.gamification_crud import get_leaderboard, get_user_rank_row, get_xp_rows_for_users
from app.database.session import get_db
from app.schemas.gamification import LeaderboardEntry

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ── Leaderboard endpoints ─────────────────────────────────────────────────────

@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard_endpoint(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _user_id: uuid.UUID = Depends(get_current_user_id),
):
    rows = await get_leaderboard(db, limit)
    return [
        LeaderboardEntry(rank=i + 1, user_id=str(r.user_id), total_xp=r.total_xp, level=r.level)
        for i, r in enumerate(rows)
    ]


# Rank-reward tiers: single source of truth shared by both /leaderboard/rank-rewards
# and /rank-unlock/{user_id} — previously duplicated verbatim in each handler.
RANK_REWARD_TIERS = [
    {"rank_from": 1,  "rank_to": 10, "premium_months": 3, "label": "Top 10",  "icon": "🏆"},
    {"rank_from": 11, "rank_to": 20, "premium_months": 2, "label": "Top 20",  "icon": "💎"},
    {"rank_from": 21, "rank_to": 30, "premium_months": 1, "label": "Top 30",  "icon": "⭐"},
]


def get_rank_reward_unlock(rank: int) -> dict | None:
    """Return the {premium_months, label, icon} unlock tier for a given rank,
    or None if the rank falls outside every tier."""
    for tier in RANK_REWARD_TIERS:
        if tier["rank_from"] <= rank <= tier["rank_to"]:
            return {"premium_months": tier["premium_months"], "label": tier["label"], "icon": tier["icon"]}
    return None


@router.get("/leaderboard/rank-rewards")
async def get_rank_rewards():
    return {
        "tiers": RANK_REWARD_TIERS,
        "reset_day": "1st of every month",
        "note": "Rankings reset monthly. Rewards applied automatically on the 1st.",
    }


@router.get("/rank-unlock/{user_id}", dependencies=[Depends(verify_owner_or_admin)])
async def get_user_rank_unlock(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Rank + unlock tier + the caller's own total_xp/level — the latter two
    let the client compute "XP to next tier" without needing the caller to
    appear in the (top-200-capped) /leaderboard response, which silently broke
    this for anyone ranked below the fetched page (rendered as "+undefined XP").
    Redis-cached per user; backed by ix_user_xp_total_xp so the rank COUNT(*)
    is an index range scan, not a full table scan, at 6k+ concurrent users."""
    cache_key = f"rank_unlock:{user_id}"
    redis = await get_redis()
    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    row = await get_user_rank_row(db, user_id)
    if row is None:
        payload = {"rank": None, "unlock": None, "total_xp": 0, "level": 1}
    else:
        rank = row["rank"]
        unlock = get_rank_reward_unlock(rank)
        payload = {"rank": rank, "unlock": unlock, "total_xp": row["total_xp"], "level": row["level"]}

    if redis is not None:
        try:
            await redis.set(cache_key, json.dumps(payload), ex=settings.RANK_UNLOCK_CACHE_TTL_SECONDS)
        except Exception:
            pass
    return payload


@router.get("/leaderboard/friends/{user_id}", dependencies=[Depends(verify_owner_or_admin)])
async def get_friends_leaderboard(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Friends-only XP leaderboard for the Growth Dashboard: the caller plus
    every ACCEPTED friend (resolved via user_service), ranked by total XP.
    Friends with no XP row yet still appear (0 XP, level 1) so brand-new
    friends aren't invisible. Redis-cached per user for 45s."""
    cache_key = f"lb:friends:{user_id}"
    redis = await get_redis()
    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    friends: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=settings.USER_SERVICE_TIMEOUT_SECONDS) as client:
            resp = await client.get(
                f"{settings.USER_SERVICE_URL}/api/v1/users/internal/friends",
                params={"user_id": str(user_id)},
                headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            )
        if resp.status_code == 200:
            friends = resp.json()
    except Exception:
        friends = []  # fail open: leaderboard of one (the caller) beats a 5xx on the dashboard

    names = {f["user_id"]: f.get("full_name") for f in friends}
    avatars = {f["user_id"]: f.get("avatar_url") for f in friends}
    all_ids = {user_id} | {uuid.UUID(f["user_id"]) for f in friends}

    xp_by_id = await get_xp_rows_for_users(db, all_ids)

    entries = []
    for uid in all_ids:
        row = xp_by_id.get(uid)
        entries.append({
            "user_id": str(uid),
            "full_name": names.get(str(uid)),
            "avatar_url": avatars.get(str(uid)),
            "total_xp": row.total_xp if row else 0,
            "level": row.level if row else 1,
            "is_me": uid == user_id,
        })
    entries.sort(key=lambda e: (-e["total_xp"], e["user_id"]))
    for i, e in enumerate(entries):
        e["rank"] = i + 1

    payload = {"entries": entries, "friend_count": len(friends)}
    if redis is not None:
        try:
            await redis.set(cache_key, json.dumps(payload), ex=settings.FRIEND_LEADERBOARD_CACHE_TTL_SECONDS)
        except Exception:
            pass
    return payload
