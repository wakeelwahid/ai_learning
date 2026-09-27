import time
from collections import defaultdict

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.middleware.cors import ALLOWED_HEADERS, ALLOWED_METHODS, get_cors_origins


def _cors_headers_for(request: Request) -> dict[str, str]:
    """A 429 built as a plain Response(...) returned directly from
    BaseHTTPMiddleware.dispatch() short-circuits before the outer
    CORSMiddleware gets a chance to inject headers (a documented Starlette
    gotcha with stacked BaseHTTPMiddleware layers) — confirmed live via the
    gateway's identical rate limiter, where a browser request that hit this
    path came back with no Access-Control-Allow-Origin header at all, so the
    browser blocked the frontend from reading the response entirely and it
    surfaced as a bare network error instead of the real rate-limit message."""
    origin = request.headers.get("origin")
    if origin and origin in get_cors_origins():
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": ", ".join(ALLOWED_METHODS),
            "Access-Control-Allow-Headers": ", ".join(ALLOWED_HEADERS),
            "Vary": "Origin",
        }
    return {}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiter. Use Redis-based limiter in production."""

    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.calls: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next) -> Response:
        # CORS preflight carries no user action of its own — the browser
        # sends it automatically before every cross-origin request with a
        # custom header. Counting it here (like the gateway's identical
        # limiter did — see api_gateway/app/middleware/rate_limit.py for the
        # full incident writeup) silently halves every route's effective
        # limit and, once busy enough, can 429 the preflight itself, which
        # surfaces to the browser as a bare network error before the real
        # request is ever sent.
        if request.method == "OPTIONS":
            return await call_next(request)

        ip = request.client.host if request.client else "unknown"
        now = time.time()
        window = 60.0

        self.calls[ip] = [t for t in self.calls[ip] if now - t < window]

        if len(self.calls[ip]) >= self.requests_per_minute:
            return Response(
                content='{"detail":"Rate limit exceeded"}',
                status_code=429,
                media_type="application/json",
                headers=_cors_headers_for(request),
            )

        self.calls[ip].append(now)
        return await call_next(request)
