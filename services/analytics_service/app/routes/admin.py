import json
from datetime import date, timedelta

import httpx
from app.core.dependencies import require_admin
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import (
    TTL_ADMIN, admin_engagement_key, admin_overview_key, cache_get, cache_set,
)
from app.core.config import settings
from app.core.redis import get_redis
from app.crud import aggregate_crud
from app.database.session import get_db
from app.schemas.admin import (
    AdminBattleStatsResponse,
    AdminDailyActiveResponse,
    AdminEngagementResponse,
    AdminOverviewResponse,
    AdminRevenueResponse,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── Admin analytics ───────────────────────────────────────────────────────────

@router.get("/admin/engagement", response_model=AdminEngagementResponse, dependencies=[Depends(require_admin)])
async def admin_engagement(
    days: int = Query(7, ge=1, le=90, description="Trend window in days"),
    db: AsyncSession = Depends(get_db),
) -> AdminEngagementResponse:
    """Real DAU/WAU + N-day activity trend from StudentProgress.updated_at.

    avg_session_minutes is explicitly null — this platform has no session-
    duration tracking anywhere (see the audit that preceded this fix); it is
    NOT estimated or hardcoded to look like a real number.

    Cache-aside, 10-min TTL, keyed by days (mirrors /admin/daily-active,
    which already took a real days param — this endpoint previously hardcoded
    trend_days=7 with no way for the caller to change it).
    """
    cache_key = admin_engagement_key(days)
    cached = await cache_get(cache_key)
    if cached:
        return AdminEngagementResponse(**cached)

    stats = await aggregate_crud.get_engagement_stats(db, trend_days=days)
    response = AdminEngagementResponse(
        **stats,
        avg_session_minutes=None,
        avg_session_minutes_note="Insufficient data — no session-duration tracking exists yet",
    )
    await cache_set(cache_key, response.model_dump(), TTL_ADMIN)
    return response


@router.get("/admin/weekly-engagement", response_model=AdminEngagementResponse, dependencies=[Depends(require_admin)])
async def admin_weekly_engagement(
    days: int = Query(7, ge=1, le=90, description="Trend window in days"),
    db: AsyncSession = Depends(get_db),
) -> AdminEngagementResponse:
    """Alias for /admin/engagement — matches gateway route /analytics/admin/weekly-engagement."""
    return await admin_engagement(days, db)


@router.get("/admin/revenue", response_model=AdminRevenueResponse, dependencies=[Depends(require_admin)])
async def admin_revenue(request: Request) -> AdminRevenueResponse:
    """Delegates to payment_service's real /admin/revenue (captured-payment
    sums, real subscription churn counts) — payment_service's Payment/
    Subscription tables are the authoritative source, not a local estimate.
    Forwards the caller's own admin bearer token."""
    auth_header = request.headers.get("authorization", "")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.PAYMENT_SERVICE_URL}/api/v1/payments/admin/revenue",
                headers={"Authorization": auth_header},
            )
        if resp.status_code == 200:
            data = resp.json()
            # trial_conversions has no backing data anywhere on this platform
            # (no trial concept exists in payment_service's models) — report
            # that honestly instead of fabricating a number.
            data["trial_conversions"] = None
            data["trial_conversions_note"] = "Insufficient data — no trial tracking exists yet"
            return AdminRevenueResponse(**data)
    except httpx.RequestError:
        pass
    raise HTTPException(status_code=503, detail="Revenue statistics temporarily unavailable")


@router.get("/admin/overview", response_model=AdminOverviewResponse, dependencies=[Depends(require_admin)])
async def admin_overview(db: AsyncSession = Depends(get_db)) -> AdminOverviewResponse:
    """Cache-aside, 10-min TTL — same rationale as /admin/engagement."""
    cached = await cache_get(admin_overview_key())
    if cached:
        return AdminOverviewResponse(**cached)

    response = await aggregate_crud.get_admin_overview(db)
    await cache_set(admin_overview_key(), response.model_dump(), TTL_ADMIN)
    return response


@router.get("/admin/daily-active", response_model=AdminDailyActiveResponse, dependencies=[Depends(require_admin)])
async def admin_daily_active(days: int = Query(default=7, ge=1, le=90), db: AsyncSession = Depends(get_db)) -> AdminDailyActiveResponse:
    """Return daily active user counts for the last N days based on StudentProgress activity."""
    cache_key = f"analytics:daily_active:{days}"
    try:
        r = await get_redis()
        cached = await r.get(cache_key)
        if cached:
            return AdminDailyActiveResponse(**json.loads(cached))
    except Exception:
        pass

    cutoff = date.today() - timedelta(days=days - 1)
    day_map = await aggregate_crud.get_daily_active_counts(db, cutoff)
    trend = []
    for i in range(days):
        d = cutoff + timedelta(days=i)
        label = d.strftime("%b") + " " + str(d.day)
        trend.append({"date": label, "students": day_map.get(str(d), 0)})
    payload = AdminDailyActiveResponse(trend=trend)
    try:
        r = await get_redis()
        await r.setex(cache_key, 600, payload.model_dump_json())  # 10-minute TTL
    except Exception:
        pass
    return payload


@router.get("/admin/battle-stats", response_model=AdminBattleStatsResponse, dependencies=[Depends(require_admin)])
async def admin_battle_stats(request: Request) -> AdminBattleStatsResponse:
    """Delegates to battle_service's own real /admin/stats aggregation
    (total/by_status/by_type/duration/XP-exchanged/win-loss — computed from
    actual Battle/BattleParticipant/BattleStats rows) rather than maintaining
    a separate, stale re-derivation here. Forwards the caller's own admin
    bearer token — battle_service's endpoint enforces require_admin itself."""
    auth_header = request.headers.get("authorization", "")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.BATTLE_SERVICE_URL}/api/v1/battles/admin/stats",
                headers={"Authorization": auth_header},
            )
        if resp.status_code == 200:
            return AdminBattleStatsResponse(**resp.json())
    except httpx.RequestError:
        pass
    raise HTTPException(status_code=503, detail="Battle statistics temporarily unavailable")
