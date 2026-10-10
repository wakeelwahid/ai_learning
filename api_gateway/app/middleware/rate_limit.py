"""
Redis-backed sliding-window rate limiter — production grade.

Phase 9 fixes:
  1. Single source of truth: uses settings.RATE_LIMIT_PER_MINUTE (no more hardcoded 200)
  2. Authenticated requests keyed on user ID (from JWT), not IP
     — prevents shared IP (campus WiFi, NAT) from starving multiple users
  3. Guest/unauthenticated requests still keyed on IP
  4. WebSocket connections are exempt (persistent connections)

Rate key patterns:
  rl:ip:{ip}:{limit}              — unauthenticated / guest
  rl:user:{user_id}:{route_key}  — authenticated (JWT present)
  rl:quiz_submit:{user_token_fp} — quiz submit routes (per-user fingerprint)
"""
import time
from collections import defaultdict

import redis.asyncio as aioredis
from fastapi import Request, Response
from jose import jwt
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.core.cors import ALLOWED_HEADERS, ALLOWED_METHODS, get_cors_origins

# Paths that bypass the rate limiter entirely
_EXEMPT = frozenset({
    "/health", "/health/services",
    "/docs", "/openapi.json", "/redoc",
    "/ws",                      # WebSocket — persistent connection, not per-request
    "/metrics",                 # Prometheus scrape
})
# NOTE: "/api/v1/battles" was previously listed above as a supposed "WS path
# prefix". It never worked as a prefix (dispatch() below does an exact `path in
# _EXEMPT` test), and as an exact match it silently exempted the two real HTTP
# routes that live at that exact path — GET (list battles) and POST (CREATE a
# battle) — from rate limiting entirely, letting one client spam battle
# creation unbounded. The battle WebSocket at
# /api/v1/battles/{battle_id}/ws needs no entry here at all: RateLimitMiddleware
# is a BaseHTTPMiddleware, which Starlette only runs for "http" scope, so
# WebSocket handshakes never reach this middleware in the first place.

# Route-specific overrides  (path_prefix, limit_per_minute)
# NOTE: all other routes use settings.RATE_LIMIT_PER_MINUTE (Phase 9 fix)
#
# Values come from Settings (app/config.py), which reads them from the
# environment — nothing here is hardcoded anymore. Tune per-environment via
# .env, e.g. production should set RATE_LIMIT_OTP_SEND=5 (SMS costs money;
# dev's higher default exists only because testing several numbers back-to-
# back from one shared dev IP used to trip the old hardcoded 5/min instantly).
_ROUTE_LIMITS: list[tuple[str, int]] = [
    ("/api/v1/auth/login",             settings.RATE_LIMIT_LOGIN),
    ("/api/v1/auth/register",          settings.RATE_LIMIT_REGISTER),
    ("/api/v1/auth/forgot-password",   settings.RATE_LIMIT_FORGOT_PASSWORD),
    ("/api/v1/auth/otp/send",          settings.RATE_LIMIT_OTP_SEND),
    ("/api/v1/auth/otp/verify",        settings.RATE_LIMIT_OTP_VERIFY),
    ("/api/v1/auth/",                  settings.RATE_LIMIT_AUTH_OTHER),
    ("/api/v1/quizzes/attempts/submit",        settings.RATE_LIMIT_QUIZ_SUBMIT),
    ("/api/v1/quizzes/attempts/batch-submit",  settings.RATE_LIMIT_QUIZ_SUBMIT),
    ("/api/v1/ai/admin/upload",         settings.RATE_LIMIT_FILE_UPLOAD),
    ("/api/v1/ai/",                    settings.RATE_LIMIT_AI),
    ("/api/v1/payments/coupons/validate",      settings.RATE_LIMIT_COUPON_VALIDATE),
    ("/api/v1/payments/orders",         settings.RATE_LIMIT_PAYMENT_ORDER),
    ("/api/v1/payments/verify",         settings.RATE_LIMIT_PAYMENT_ORDER),
    ("/api/v1/payments/retry",          settings.RATE_LIMIT_PAYMENT_ORDER),
    ("/api/v1/payments/parent/create-order", settings.RATE_LIMIT_PAYMENT_ORDER),
    ("/api/v1/referrals/register",      settings.RATE_LIMIT_REFERRAL_REGISTER),
    ("/api/v1/users/chat/rooms/",       settings.RATE_LIMIT_CHAT_SEND),
    ("/api/v1/users/profile/avatar",    settings.RATE_LIMIT_FILE_UPLOAD),
]


def _cors_headers_for(request: Request) -> dict[str, str]:
    """CORSMiddleware never runs on this response — a 429 built as a plain
    Response(...) returned directly from BaseHTTPMiddleware.dispatch() short-
    circuits before the outer CORSMiddleware gets a chance to inject headers
    (a documented Starlette gotcha with stacked BaseHTTPMiddleware layers).
    Without an Access-Control-Allow-Origin header, the browser can't let JS
    read the response at all — axios sees it as a bare network error with no
    status code, and the login page showed "Unable to connect. Please check
    your internet connection." instead of the real rate-limit message.
    Replicate just enough of add_cors()'s behavior by hand here."""
    origin = request.headers.get("origin")
    if origin and origin in get_cors_origins():
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": ", ".join(ALLOWED_METHODS),
            "Access-Control-Allow-Headers": ", ".join(ALLOWED_HEADERS),
            "Vary": "Origin",
        }
    return {}


def _get_limit(path: str) -> int:
    for prefix, limit in _ROUTE_LIMITS:
        if path.startswith(prefix):
            return limit
    return settings.RATE_LIMIT_PER_MINUTE   # Phase 9 fix: use config, was hardcoded 200


def _limit_prefix(path: str) -> str:
    """The _ROUTE_LIMITS prefix that _get_limit() matched for `path`, used to
    give each distinctly-limited route its own counter bucket. Keying on the
    prefix rather than on the limit value keeps two routes that merely happen
    to share a number (e.g. /payments/orders and /payments/verify, both
    RATE_LIMIT_PAYMENT_ORDER) intentionally grouped, while never letting a
    loosely-limited route's traffic count toward a tightly-limited one."""
    for prefix, _limit in _ROUTE_LIMITS:
        if path.startswith(prefix):
            return prefix
    return "default"


def _extract_user_id(auth_header: str) -> str | None:
    """Extract user_id claim from Bearer JWT without full validation (gateway just peeks)."""
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        # Peek at claims WITHOUT verifying the signature — the gateway only needs
        # the subject for the rate-key. NOTE: this service uses python-jose, whose
        # decode() requires a key; the no-key "just read the payload" call is
        # get_unverified_claims() (PyJWT's `decode(..., options={"verify_signature": False})`
        # is NOT valid here and raises TypeError). Catch broadly so a malformed
        # token can never 500 the gateway — fall back to IP-based limiting instead.
        payload = jwt.get_unverified_claims(token)
        return payload.get("sub") or payload.get("user_id")
    except Exception:
        return None


def _rate_key(path: str, request: Request) -> str:
    """
    Phase 9: user-based key for authenticated requests.
    Falls back to IP for unauthenticated (login/register/etc.)
    """
    auth_header = request.headers.get("Authorization", "")
    ip = request.client.host if request.client else "unknown"

    # Quiz submit: per-user via token fingerprint
    if path.startswith(("/api/v1/quizzes/attempts/submit", "/api/v1/quizzes/attempts/batch-submit")):
        user_id = _extract_user_id(auth_header)
        if user_id:
            return f"rl:user:{user_id}:quiz_submit"
        return f"rl:ip:{ip}:quiz_submit"

    # Auth routes: always IP-based (user isn't logged in yet).
    # The bucket is segregated by the matched _ROUTE_LIMITS prefix, not just by
    # "auth": every /auth/ route used to share one key while each was still
    # compared against its OWN limit, so the tight per-route limits were not
    # independently enforceable — interleaving calls to a loose route
    # (/auth/login at 30, /auth/me at 60) with a tight one
    # (/auth/forgot-password at 5, /auth/otp/send at 15) let far more than the
    # tight route's limit through, because the shared counter was only ever
    # compared against the limit of whichever path happened to be hit.
    if path.startswith("/api/v1/auth/"):
        return f"rl:ip:{ip}:auth:{_limit_prefix(path)}"

    # All other authenticated routes: key on user_id to prevent shared-IP
    # starvation. The user_id comes from an UNVERIFIED token (the gateway has
    # no signing key), so it is attacker-controllable: a forged unsigned JWT
    # with a random `sub` per request would otherwise get a fresh bucket every
    # time (limit bypass), or a victim's `sub` would drain the victim's quota.
    # Binding the key to the source IP as well means a single client can't mint
    # unlimited buckets by rotating `sub`, and can't touch another IP's user
    # bucket. (dispatch also enforces a per-IP ceiling across all buckets.)
    user_id = _extract_user_id(auth_header)
    if user_id:
        limit = _get_limit(path)
        return f"rl:user:{user_id}:ip:{ip}:{limit}"

    # Unauthenticated non-auth routes
    limit = _get_limit(path)
    return f"rl:ip:{ip}:{limit}"


# Per-IP ceiling across ALL authenticated buckets from one IP — stops a client
# from exceeding a route's limit by rotating a forged token's `sub` (each new
# sub is a fresh per-user bucket, but all of them share this one IP ceiling).
# Generous so it never bites a real shared IP (school/NAT) doing normal work.
_IP_CEILING_PER_MIN = 600


def _ip_ceiling_key(request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"rl:ipceil:{ip}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._redis: aioredis.Redis | None = None
        self._fallback: dict[str, list[float]] = defaultdict(list)

    async def _get_redis(self) -> aioredis.Redis | None:
        if self._redis is not None:
            return self._redis
        try:
            self._redis = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
            await self._redis.ping()
            return self._redis
        except Exception:
            self._redis = None
            return None

    async def _is_limited_redis(self, key: str, limit: int, redis: aioredis.Redis) -> tuple[bool, int]:
        """Sliding window using Redis sorted set. Returns (is_limited, current_count)."""
        now = time.time()
        window_start = now - 60
        pipe = redis.pipeline()
        pipe.zremrangebyscore(key, "-inf", window_start)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, 62)   # slightly longer than window to handle clock skew
        results = await pipe.execute()
        count: int = results[2]
        return count > limit, count

    def _is_limited_memory(self, key: str, limit: int) -> tuple[bool, int]:
        now = time.time()
        calls = self._fallback[key]
        self._fallback[key] = [t for t in calls if now - t < 60]
        if len(self._fallback[key]) >= limit:
            return True, len(self._fallback[key])
        self._fallback[key].append(now)
        return False, len(self._fallback[key])

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # CORS preflight — the browser sends this automatically before every
        # cross-origin request with a custom header (Authorization,
        # Content-Type: application/json), completely outside app code's
        # control, and it carries no request body or user action of its own.
        # Counting it against the same bucket as the real request silently
        # halved every route's effective limit, and once a tightly-limited
        # route (e.g. otp/send) got busy enough that the OPTIONS itself hit
        # 429, the browser's preflight failed before the real POST was ever
        # sent — which surfaces in axios as a bare network error (no
        # response object at all) and the login page showed "Unable to
        # connect. Please check your internet connection." even though the
        # backend was completely healthy and reachable. Exempt it outright.
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check exact exempt paths and prefix-based WebSocket paths
        if path in _EXEMPT or path.startswith("/ws") or "/ws?" in path:
            return await call_next(request)

        limit    = _get_limit(path)
        rate_key = _rate_key(path, request)

        redis = await self._get_redis()
        # Per-IP ceiling: for a per-user bucket (keyed on an unverified, hence
        # spoofable, token sub), also enforce one ceiling across everything
        # from this IP, so rotating the forged sub can't multiply the limit.
        if rate_key.startswith("rl:user:"):
            ceil_key = _ip_ceiling_key(request)
            try:
                if redis:
                    ceil_limited, _ = await self._is_limited_redis(ceil_key, _IP_CEILING_PER_MIN, redis)
                else:
                    ceil_limited, _ = self._is_limited_memory(ceil_key, _IP_CEILING_PER_MIN)
            except Exception:
                self._redis = None
                ceil_limited, _ = self._is_limited_memory(ceil_key, _IP_CEILING_PER_MIN)
            if ceil_limited:
                return Response(
                    content='{"detail":"Too many requests. Please slow down and try again in a minute."}',
                    status_code=429, media_type="application/json",
                    headers={"Retry-After": "60", **_cors_headers_for(request)},
                )

        if redis:
            try:
                limited, count = await self._is_limited_redis(rate_key, limit, redis)
            except Exception:
                # Redis pipeline failed mid-request (auth error, timeout, etc.)
                # Reset cached client so next request retries the connection,
                # and fall back to in-memory rate limiting for this request.
                self._redis = None
                limited, count = self._is_limited_memory(rate_key, limit)
        else:
            limited, count = self._is_limited_memory(rate_key, limit)

        if limited:
            return Response(
                content='{"detail":"Too many requests. Please slow down and try again in a minute."}',
                status_code=429,
                media_type="application/json",
                headers={
                    "Retry-After":       "60",
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    **_cors_headers_for(request),
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"]     = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - count))
        return response
