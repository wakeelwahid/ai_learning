"""Shared JWT authentication & RBAC dependencies for every backend service
except auth_service.

THIS IS THE ONE SOURCE OF TRUTH. It is copied verbatim into every service
at services/<name>_service/app/core/_shared_auth.py by
tools/sync_shared_auth.py — never edit a copy directly, edit this file and
re-run that script. (Each service's Docker build context is scoped to its
own folder, so this file can't be COPYed across that boundary at build
time; syncing a verbatim copy into each service is the practical
alternative to changing 11 docker-compose.yml build contexts.)

No service here holds a JWT signing secret and none decodes tokens
locally — auth_service is the single authentication authority. Every
request's bearer token is verified by calling auth_service's
GET /api/v1/auth/verify API. Results are cached in the calling service's
OWN Redis (keyed by a hash of the token) for a short TTL so repeat requests
from the same session don't pay a network round-trip every time. If
auth_service is unreachable, requests fail closed with 503 — auth_service
is every service's one allowed dependency here.

Usage in a service's app/core/dependencies.py:

    from app.core.config import settings
    from app.core._shared_auth import build_auth_dependencies

    _auth = build_auth_dependencies(settings)
    get_current_user_id = _auth.get_current_user_id
    get_current_user_id_and_role = _auth.get_current_user_id_and_role
    require_admin = _auth.require_admin
    require_internal = _auth.require_internal
    is_admin_role = _auth.is_admin_role
    # ...plus whichever of the optional extras this service needs
    # (get_optional_user_id, get_optional_user_id_and_role, require_teacher,
    # verify_owner_or_admin), then any genuinely service-specific
    # dependencies defined locally below in that same file.

Implemented as closures over one shared, private mutable Redis-connection
cell per service (not a class with Depends(self.method) defaults — FastAPI
resolves a Depends() default at the time the class body executes, before
any instance exists, so a bound method can't be wired in as another
method's own default the way a plain function can)."""
from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from dataclasses import dataclass, field
from typing import Protocol

import httpx
import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

VERIFY_CACHE_TTL_SECONDS = 60
HTTP_TIMEOUT_SECONDS = 3.0
INTERNAL_NETS = ("127.", "10.", "172.", "192.168.")

bearer = HTTPBearer(auto_error=False)


class _SettingsProtocol(Protocol):
    """The subset of a service's Settings this module actually reads —
    documented here so a service's real settings object only needs these
    attributes, not to literally subclass anything."""
    REDIS_URL: str
    AUTH_SERVICE_URL: str
    INTERNAL_SERVICE_SECRET: str


def _cache_key(token: str) -> str:
    return "authverify:" + hashlib.sha256(token.encode()).hexdigest()


def is_admin_role(role: str) -> bool:
    return role in ("admin", "super_admin")


@dataclass
class AuthDependencies:
    """One instance per service (built once at import time from that
    service's own settings). Every public attribute is a plain function
    suitable for FastAPI's Depends(...) — see module docstring for why
    these are closures assembled in __post_init__, not bound methods."""

    settings: _SettingsProtocol
    _redis_client: object = field(default=None, repr=False)

    def __post_init__(self) -> None:
        async def get_redis():
            if self._redis_client is not None:
                return self._redis_client
            try:
                r = aioredis.from_url(self.settings.REDIS_URL, decode_responses=True, socket_timeout=1)
                await r.ping()
                self._redis_client = r
                return r
            except Exception:
                return None

        async def verify_token(token: str) -> dict:
            """Return {"user_id": str, "role": str, "is_active": bool} for
            a bearer token by calling auth_service, using this service's
            own Redis as a short-lived cache. Raises HTTPException on
            invalid/expired token (401) or if auth_service is unreachable
            (503 — fail closed)."""
            cache_key = _cache_key(token)
            redis = await get_redis()
            if redis is not None:
                try:
                    cached = await redis.get(cache_key)
                    if cached:
                        return json.loads(cached)
                except Exception:
                    # get_redis() only pings ONCE and then caches the client
                    # forever (self._redis_client), so a Redis outage AFTER
                    # a successful first connection isn't caught there — it
                    # surfaces here instead. Fall through to the auth_service
                    # HTTP call below exactly like a cache miss would.
                    pass

            try:
                async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
                    resp = await client.get(
                        f"{self.settings.AUTH_SERVICE_URL}/api/v1/auth/verify",
                        headers={"Authorization": f"Bearer {token}"},
                    )
            except httpx.RequestError:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Authentication service unavailable",
                )

            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired token",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            data = resp.json()
            if redis is not None:
                try:
                    await redis.set(cache_key, json.dumps(data), ex=VERIFY_CACHE_TTL_SECONDS)
                except Exception:
                    pass
            return data

        async def get_current_user_id(
            creds: HTTPAuthorizationCredentials | None = Depends(bearer),
        ) -> uuid.UUID:
            if not creds:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Not authenticated",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            data = await verify_token(creds.credentials)
            return uuid.UUID(data["user_id"])

        async def get_current_user_id_and_role(
            creds: HTTPAuthorizationCredentials | None = Depends(bearer),
        ) -> tuple[uuid.UUID, str]:
            """Like get_current_user_id, but also returns the caller's role."""
            if not creds:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Not authenticated",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            data = await verify_token(creds.credentials)
            return uuid.UUID(data["user_id"]), data["role"]

        async def get_optional_user_id(
            creds: HTTPAuthorizationCredentials | None = Depends(bearer),
        ) -> uuid.UUID | None:
            """Like get_current_user_id, but returns None instead of
            raising when there's no token, the token is invalid/expired,
            OR auth_service can't be reached (503) — for routes that serve
            both anonymous and authenticated callers, where a verification
            failure should never fail the request."""
            if not creds:
                return None
            try:
                data = await verify_token(creds.credentials)
                return uuid.UUID(data["user_id"])
            except HTTPException:
                return None

        async def get_optional_user_id_and_role(
            creds: HTTPAuthorizationCredentials | None = Depends(bearer),
        ) -> tuple[uuid.UUID, str] | tuple[None, None]:
            """Like get_current_user_id_and_role, but returns (None, None)
            instead of raising for the same anonymous-or-authenticated
            routes get_optional_user_id serves."""
            if not creds:
                return None, None
            try:
                data = await verify_token(creds.credentials)
                return uuid.UUID(data["user_id"]), data["role"]
            except HTTPException:
                return None, None

        async def require_admin(
            identity: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
        ) -> uuid.UUID:
            """Require admin or super_admin role."""
            user_id, role = identity
            if not is_admin_role(role):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
            return user_id

        async def require_teacher(
            identity: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
        ) -> uuid.UUID:
            """Require teacher, admin, or super_admin role — same allowed
            set everywhere this dependency is used."""
            user_id, role = identity
            if role not in ("teacher", "admin", "super_admin"):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher access required")
            return user_id

        async def verify_owner_or_admin(
            user_id: uuid.UUID,
            identity: tuple[uuid.UUID, str] = Depends(get_current_user_id_and_role),
        ) -> uuid.UUID:
            """Ownership guard for routes with a `{user_id}` path
            parameter. FastAPI binds this dependency's `user_id` argument
            from the path parameter of the same name on the route it's
            attached to. Requires the authenticated caller's verified id
            to match that `user_id`, unless the caller holds an
            admin/super_admin role. Raises 403 on mismatch."""
            current_user_id, role = identity
            if current_user_id != user_id and not is_admin_role(role):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot access another user's data.",
                )
            return current_user_id

        def require_internal(request: Request) -> None:
            """Allow only requests originating from Docker-internal or
            loopback addresses AND presenting the shared X-Internal-Secret
            header. Used for endpoints that other microservices call
            service-to-service, where there is no end-user JWT to forward
            and the caller is itself a trusted backend service on the
            private network, not a browser/app client. The IP check alone
            is not a real trust boundary (any container on the Docker
            network can spoof it), so it's kept only as defense-in-depth
            alongside the secret check, which fails closed if
            INTERNAL_SERVICE_SECRET is unset. Returns 404 (not 403) to
            avoid leaking that the endpoint exists."""
            client_ip = request.client.host if request.client else ""
            if not any(client_ip.startswith(prefix) for prefix in INTERNAL_NETS):
                raise HTTPException(status_code=404, detail="Not found")
            provided = request.headers.get("x-internal-secret", "")
            expected = self.settings.INTERNAL_SERVICE_SECRET
            if not expected or not hmac.compare_digest(provided, expected):
                raise HTTPException(status_code=404, detail="Not found")

        self.get_redis = get_redis
        self.verify_token = verify_token
        self.get_current_user_id = get_current_user_id
        self.get_current_user_id_and_role = get_current_user_id_and_role
        self.get_optional_user_id = get_optional_user_id
        self.get_optional_user_id_and_role = get_optional_user_id_and_role
        self.is_admin_role = is_admin_role
        self.require_admin = require_admin
        self.require_teacher = require_teacher
        self.verify_owner_or_admin = verify_owner_or_admin
        self.require_internal = require_internal


def build_auth_dependencies(settings: _SettingsProtocol) -> AuthDependencies:
    """Call once per service, at module scope in app/core/dependencies.py,
    with that service's own settings object."""
    return AuthDependencies(settings=settings)
