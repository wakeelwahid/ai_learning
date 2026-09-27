"""
EdTech API Gateway

Single entry point for all microservices.
All frontend traffic hits :8000 and is routed to the right service.
"""
import asyncio
from contextlib import asynccontextmanager
from urllib.parse import urlencode

import websockets
from fastapi import FastAPI, Request, WebSocket, Query, status
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import settings
from app.core.cors import add_cors
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.logging import RequestLoggingMiddleware
from app.router import router
from app.services import ALL_SERVICES


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Gracefully close all upstream connection pools on shutdown
    for svc in ALL_SERVICES:
        await svc.close()


if settings.SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENV,
        release=settings.APP_NAME,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
    lifespan=lifespan,
)

Instrumentator(should_group_status_codes=False, should_ignore_untemplated=True).instrument(app).expose(app, include_in_schema=False, tags=["observability"])

# ─── Middleware (applied bottom-up in FastAPI) ────────────────────────────────

# 1. CORS — must be outermost so preflight OPTIONS returns immediately.
# Environment-aware allowlist (production/development/localhost) from
# shared/cors.py — see that module for the ENV-selection rules. No wildcard
# origins, no wildcard methods/headers, no credentials mode (Bearer-token
# auth doesn't need it).
add_cors(app)

# 2. Rate limiting per IP
app.add_middleware(RateLimitMiddleware)

# 3. Request/response logging with request-id
app.add_middleware(RequestLoggingMiddleware)

# ─── Global exception handlers ────────────────────────────────────────────────

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred. Please try again."},
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

app.include_router(router)


@app.get("/health", tags=["Gateway"])
async def health():
    return {"status": "healthy", "service": settings.APP_NAME, "version": "1.0.0"}


# ─── WebSocket proxy ──────────────────────────────────────────────────────────

async def _ws_proxy(websocket: WebSocket, upstream_url: str) -> None:
    """Generic bidirectional WebSocket proxy helper."""
    await websocket.accept()
    try:
        async with websockets.connect(upstream_url) as upstream:
            async def fwd_up():
                try:
                    while True:
                        data = await websocket.receive_text()
                        await upstream.send(data)
                except Exception:
                    pass
            async def fwd_down():
                try:
                    async for msg in upstream:
                        await websocket.send_text(msg)
                except Exception:
                    pass
            await asyncio.gather(fwd_up(), fwd_down())
    except Exception:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@app.websocket("/ws")
async def websocket_proxy(websocket: WebSocket, token: str = Query(...)):
    """Proxy for user_service real-time chat WebSocket."""
    upstream = settings.USER_SERVICE_URL.replace("http://", "ws://") + "/ws?token=" + token
    await _ws_proxy(websocket, upstream)


@app.websocket("/api/v1/battles/{battle_id}/ws")
async def battle_ws_proxy(
    websocket: WebSocket,
    battle_id: str,
    token: str = Query(...),
    display_name: str = Query(default="Player"),
    spectator: bool = Query(default=False),
    avatar_url: str = Query(default=None),
):
    """Proxy for battle_service real-time battle WebSocket.

    Mirrors the battle_service endpoint contract: identity is derived from the
    JWT `token` on the service side — `user_id` is intentionally not accepted.
    """
    base = settings.BATTLE_SERVICE_URL.replace("http://", "ws://")
    query = {"token": token, "display_name": display_name}
    if spectator:
        query["spectator"] = "true"
    if avatar_url:
        query["avatar_url"] = avatar_url
    upstream = f"{base}/api/v1/battles/{battle_id}/ws?{urlencode(query)}"
    await _ws_proxy(websocket, upstream)
