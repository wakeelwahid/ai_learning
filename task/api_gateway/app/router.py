"""
Master router — includes every service's explicitly registered routes.

Every request that reaches the API Gateway must match one of these routes.
Unknown paths return 404 (no silent catch-all forwarding).
"""
import json

import httpx
from fastapi import APIRouter, Depends

from app.config import settings
from app.core.admin_guard import _get_redis, require_admin
from app.routes import auth, content, quiz, ai, payment, notification, analytics, gamification, referral, user, battle, career, community, opportunity
from app.services import ALL_SERVICES

router = APIRouter()

# ── Register all service routers ──────────────────────────────────────────────
router.include_router(auth.router)
router.include_router(user.router)
router.include_router(content.router)
router.include_router(quiz.router)
router.include_router(ai.router)
router.include_router(payment.router)
router.include_router(notification.router)
router.include_router(analytics.router)
router.include_router(gamification.router)
router.include_router(referral.router)
router.include_router(battle.router)
router.include_router(career.router)
router.include_router(opportunity.router)
router.include_router(community.router)


# ── Health: probe every upstream service ─────────────────────────────────────

_HEALTH_CACHE_KEY = "gw:health:services"
_HEALTH_CACHE_TTL = 10  # short — an admin dashboard polling this shouldn't
                         # re-probe all 12 services on every request, but a
                         # genuinely-down service should show as down within
                         # single-digit seconds, not minutes.


@router.get("/health/services", tags=["Gateway"], summary="Probe all upstream services",
            dependencies=[Depends(require_admin)])
async def services_health():
    """Admin-only (was unauthenticated — this leaks internal service URLs and
    raw error strings, not something to expose publicly). Redis-cached for
    10s so admin-panel polling doesn't re-probe every service on every call."""
    redis = await _get_redis()
    if redis is not None:
        cached = await redis.get(_HEALTH_CACHE_KEY)
        if cached is not None:
            return json.loads(cached)

    results: dict = {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        for svc in ALL_SERVICES:
            url = f"{svc._base_url}/health"
            try:
                r = await client.get(url)
                results[svc.service_name] = {
                    "status": "up" if r.status_code == 200 else "degraded",
                    "http_status": r.status_code,
                    "url": svc._base_url,
                }
            except Exception as exc:
                results[svc.service_name] = {
                    "status": "down",
                    "error": str(exc)[:120],
                    "url": svc._base_url,
                }

    overall = "healthy" if all(v["status"] == "up" for v in results.values()) else "degraded"
    payload = {"gateway": "up", "overall": overall, "services": results}

    if redis is not None:
        await redis.set(_HEALTH_CACHE_KEY, json.dumps(payload), ex=_HEALTH_CACHE_TTL)
    return payload


# ── Latency/usage: surface Prometheus's existing per-route metrics ──────────
#
# Every service already wires prometheus_fastapi_instrumentator (real request-
# duration histograms + counters, scraped every 15s — see
# monitoring/prometheus/prometheus.yml). Rather than building a second,
# parallel timing pipeline, this queries Prometheus's own HTTP API for the
# top-N slowest and top-N most-used routes and reshapes the result for the
# admin UI. `/metrics` and `/health` are excluded from both — the former is
# Prometheus scraping itself, the latter is pure Docker healthcheck noise,
# neither is real user traffic.

_METRICS_CACHE_KEY = "gw:health:metrics_summary"
_METRICS_CACHE_TTL = 30

_SLOWEST_QUERY = (
    'topk(10, sum by (handler, job) (rate(http_request_duration_seconds_sum'
    '{handler!="/metrics", handler!="/health"}[10m])) '
    '/ sum by (handler, job) (rate(http_request_duration_seconds_count'
    '{handler!="/metrics", handler!="/health"}[10m])))'
)
_MOST_USED_QUERY = (
    'topk(10, sum by (handler, job) (rate(http_requests_total'
    '{handler!="/metrics", handler!="/health"}[10m])))'
)


async def _prom_query(client: httpx.AsyncClient, query: str) -> list[dict]:
    resp = await client.get(f"{settings.PROMETHEUS_URL}/api/v1/query", params={"query": query})
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "success":
        return []
    return data["data"]["result"]


@router.get("/health/metrics-summary", tags=["Gateway"],
            summary="Top slowest and most-used API routes (from Prometheus)",
            dependencies=[Depends(require_admin)])
async def metrics_summary():
    redis = await _get_redis()
    if redis is not None:
        cached = await redis.get(_METRICS_CACHE_KEY)
        if cached is not None:
            return json.loads(cached)

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Sequential, not gather — two tiny Prometheus queries aren't
            # worth the added complexity, and this endpoint is Redis-cached
            # for 30s anyway.
            slowest = await _prom_query(client, _SLOWEST_QUERY)
            most_used = await _prom_query(client, _MOST_USED_QUERY)
    except httpx.RequestError:
        return {"available": False, "reason": "Prometheus unreachable", "slowest": [], "most_used": []}

    payload = {
        "available": True,
        "slowest": [
            {
                "route": r["metric"].get("handler", "?"),
                "service": r["metric"].get("job", "?"),
                "avg_ms": round(float(r["value"][1]) * 1000, 1),
            }
            for r in slowest
        ],
        "most_used": [
            {
                "route": r["metric"].get("handler", "?"),
                "service": r["metric"].get("job", "?"),
                "requests_per_sec": round(float(r["value"][1]), 3),
            }
            for r in most_used
        ],
    }
    if redis is not None:
        await redis.set(_METRICS_CACHE_KEY, json.dumps(payload), ex=_METRICS_CACHE_TTL)
    return payload
